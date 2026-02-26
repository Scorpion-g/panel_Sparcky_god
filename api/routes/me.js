import express from "express"
import { authenticate } from "../middlewares/auth.js"
import axios from "axios"

const router = express.Router()

// Cache en mémoire très simple pour éviter de spammer l’API Discord (429).
// Clé: userId, Valeur: { expiresAt, payload }
const meCache = new Map()
const CACHE_TTL_MS = Number.parseInt(process.env.ME_CACHE_TTL_MS || "15000", 10)

function getCachedMe(userId) {
  const entry = meCache.get(userId)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    meCache.delete(userId)
    return null
  }
  return entry.payload
}

function setCachedMe(userId, payload, ttlMs = CACHE_TTL_MS) {
  if (!userId) return
  meCache.set(userId, { expiresAt: Date.now() + ttlMs, payload })
}

function discordUserAvatarUrl({ id, avatar }, { size = 128 } = {}) {
  if (!id) return null
  if (!avatar) return `https://cdn.discordapp.com/embed/avatars/0.png?size=${size}`
  return `https://cdn.discordapp.com/avatars/${id}/${avatar}.png?size=${size}`
}

function discordGuildIconUrl({ id, icon }, { size = 64 } = {}) {
  if (!id || !icon) return null
  return `https://cdn.discordapp.com/icons/${id}/${icon}.png?size=${size}`
}

function buildBotInfoFromEnv() {
  const id = process.env.DISCORD_BOT_ID
  const username = process.env.DISCORD_BOT_USERNAME || "Bot"
  const avatar = process.env.DISCORD_BOT_AVATAR

  if (!id) return null

  return {
    id,
    username,
    avatar,
    avatarUrl: discordUserAvatarUrl({ id, avatar }, { size: 128 })
  }
}

router.get("/me", authenticate, async (req, res) => {
  try {
    // user minimal depuis JWT
    const user = req.user

    if (!user?.access_token) {
      return res.status(401).json({ error: "Missing Discord access token" })
    }

    const cached = getCachedMe(user.id)
    if (cached) {
      return res.json(cached)
    }

    // récupérer les guildes avec le token Discord
    const guildsRes = await axios.get("https://discord.com/api/users/@me/guilds", {
      headers: { Authorization: `Bearer ${user.access_token}` }
    })

    const enrichedUser = {
      ...user,
      avatarUrl: discordUserAvatarUrl({ id: user.id, avatar: user.avatar }, { size: 128 })
    }

    const enrichedGuilds = Array.isArray(guildsRes.data)
      ? guildsRes.data.map(g => ({
          ...g,
          iconUrl: discordGuildIconUrl({ id: g.id, icon: g.icon }, { size: 64 })
        }))
      : []

    const payload = {
      user: enrichedUser,
      bot: buildBotInfoFromEnv(),
      guilds: enrichedGuilds
    }

    setCachedMe(user.id, payload)

    return res.json(payload)
  } catch (err) {
    const status = err?.response?.status
    const data = err?.response?.data

    // Typiquement: access token Discord expiré / révoqué
    if (status === 401 || status === 403) {
      return res.status(401).json({ error: "Discord token invalid or expired" })
    }

    // Rate limit Discord: on renvoie 429 avec Retry-After pour que le front sache temporiser.
    if (status === 429) {
      const retryAfter = data?.retry_after
      if (typeof retryAfter === "number") {
        res.setHeader("Retry-After", String(retryAfter))
      }

      // On évite que 10 refresh d’affilée re-tapent Discord: on cache le 429 un court instant.
      const ttlMs = typeof retryAfter === "number" ? Math.max(250, Math.ceil(retryAfter * 1000)) : 1000
      const userId = req.user?.id
      if (userId) {
        setCachedMe(userId, { error: "Discord rate limited", retry_after: retryAfter ?? null }, ttlMs)
      }

      return res.status(429).json({
        error: "Discord rate limited",
        retry_after: retryAfter ?? null
      })
    }

    console.error("/api/me error", {
      status,
      message: err?.message,
      data
    })

    return res.status(502).json({
      error: "Failed to fetch user data",
      details: status ? { discordStatus: status, discordData: data } : undefined
    })
  }
})

export default router
