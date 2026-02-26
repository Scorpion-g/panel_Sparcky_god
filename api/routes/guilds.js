import express from "express"
import { authenticate } from "../middlewares/auth.js"
import axios from "axios"
import { getGuildConfig, setGuildConfig } from "../lib/guildConfigRepo.js"
import { getDb } from "../lib/mongo.js"

const router = express.Router()

function discordGuildIconUrl({ id, icon }, { size = 128 } = {}) {
  if (!id || !icon) return null
  return `https://cdn.discordapp.com/icons/${id}/${icon}.png?size=${size}`
}

function discordUserAvatarUrl({ id, avatar }, { size = 128 } = {}) {
  if (!id) return null
  if (!avatar) return `https://cdn.discordapp.com/embed/avatars/0.png?size=${size}`
  return `https://cdn.discordapp.com/avatars/${id}/${avatar}.png?size=${size}`
}

function getBotToken() {
  return process.env.DISCORD_BOT_TOKEN
}

function buildBotInviteUrl(guildId) {
  const clientId = process.env.DISCORD_BOT_ID || process.env.DISCORD_CLIENT_ID
  const permissions = process.env.DISCORD_BOT_INVITE_PERMISSIONS || "0"

  if (!clientId) return null

  const params = new URLSearchParams({
    client_id: clientId,
    scope: "bot applications.commands",
    permissions,
    disable_guild_select: "true"
  })

  if (guildId) params.set("guild_id", guildId)

  return `https://discord.com/oauth2/authorize?${params.toString()}`
}

function normalizeChannel(ch) {
  return {
    id: ch.id,
    name: ch.name ?? null,
    type: ch.type,
    parent_id: ch.parent_id ?? null,
    position: ch.position ?? 0
  }
}

function sortChannels(a, b) {
  // cat (type 4) en premier, puis position, puis nom
  const ta = a.type
  const tb = b.type
  if (ta === 4 && tb !== 4) return -1
  if (ta !== 4 && tb === 4) return 1
  if (a.position !== b.position) return a.position - b.position
  return String(a.name ?? "").localeCompare(String(b.name ?? ""))
}

router.get("/guilds/:guildId", authenticate, async (req, res) => {
  const { guildId } = req.params
  const botToken = getBotToken()

  if (!botToken) {
    return res.status(500).json({
      error: "Missing DISCORD_BOT_TOKEN",
      hint: "Ajoute DISCORD_BOT_TOKEN dans api/.env pour pouvoir récupérer les channels et vérifier si le bot est dans la guilde."
    })
  }

  try {
    // Infos bot (vraies) via token bot
    const botUserRes = await axios.get("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bot ${botToken}` }
    })

    const botUser = botUserRes.data

    // 1) Infos guilde via bot
    const guildRes = await axios.get(`https://discord.com/api/guilds/${guildId}`, {
      headers: { Authorization: `Bot ${botToken}` }
    })

    // 2) Channels via bot
    const channelsRes = await axios.get(`https://discord.com/api/guilds/${guildId}/channels`, {
      headers: { Authorization: `Bot ${botToken}` }
    })

    const guild = guildRes.data

    const channels = Array.isArray(channelsRes.data)
      ? channelsRes.data.map(normalizeChannel).sort(sortChannels)
      : []

    // Debug: vérifier si un doc existe vraiment dans la collection
    const db = await getDb()
    const collectionName = process.env.BOT_GUILD_CONFIG_COLLECTION || "guildconfigurations"
    const rawDoc = await db.collection(collectionName).findOne({ guildId })

    const config = await getGuildConfig(guildId)

    if (process.env.NODE_ENV !== "production") {
      console.log("[guilds] config loaded", {
        guildId,
        db: db.databaseName,
        collection: collectionName,
        hasDoc: Boolean(rawDoc),
        modLogChannel: config?.modLogChannel ?? null
      })
    }

    const payload = {
      botInGuild: true,
      inviteUrl: null,
      guild: {
        id: guild.id,
        name: guild.name,
        icon: guild.icon,
        iconUrl: discordGuildIconUrl({ id: guild.id, icon: guild.icon }, { size: 128 }),
        owner_id: guild.owner_id
      },
      bot: {
        id: botUser.id,
        username: botUser.username,
        avatarUrl: discordUserAvatarUrl({ id: botUser.id, avatar: botUser.avatar }, { size: 128 }),
        status: "online"
      },
      channels,
      config,
      configSource: {
        db: db.databaseName,
        collection: collectionName,
        hasDoc: Boolean(rawDoc)
      }
    }

    return res.json(payload)
  } catch (err) {
    const status = err?.response?.status
    const data = err?.response?.data

    if (status === 403 || status === 404) {
      // Typiquement: bot pas dans la guilde, ou pas de permission.
      return res.status(200).json({
        botInGuild: false,
        inviteUrl: buildBotInviteUrl(guildId),
        guild: { id: guildId },
        bot: {
          id: process.env.DISCORD_BOT_ID || null,
          username: process.env.DISCORD_BOT_USERNAME || "Bot",
          avatarUrl: discordUserAvatarUrl(
            { id: process.env.DISCORD_BOT_ID, avatar: process.env.DISCORD_BOT_AVATAR },
            { size: 128 }
          ),
          status: "absent"
        },
        channels: [],
        config: await getGuildConfig(guildId),
        error: "Bot is not in this guild (or missing permissions)"
      })
    }

    console.error("/api/guilds/:guildId error", { status, message: err?.message, data })
    return res.status(502).json({ error: "Failed to fetch guild details" })
  }
})

router.get("/guilds/:guildId/config", authenticate, async (req, res) => {
  const { guildId } = req.params
  return res.json({ guildId, config: await getGuildConfig(guildId) })
})

router.put("/guilds/:guildId/config", authenticate, async (req, res) => {
  const { guildId } = req.params
  const patch = req.body || {}

  const cleanBadWords = Array.isArray(patch.badWords)
    ? patch.badWords
        .map(w => String(w).trim())
        .filter(Boolean)
        .slice(0, 200)
    : undefined

  const cleanLanguage =
    typeof patch.language === "string"
      ? patch.language.replace(/[^a-zA-Z-]/g, "").toLowerCase().slice(0, 8)
      : undefined

  // Whitelist
  const next = await setGuildConfig(guildId, {
    welcomeChannel: typeof patch.welcomeChannel === "string" ? patch.welcomeChannel : null,
    leaveChannel: typeof patch.leaveChannel === "string" ? patch.leaveChannel : null,
    autoRole: typeof patch.autoRole === "string" ? patch.autoRole : null,
    modLogChannel: typeof patch.modLogChannel === "string" ? patch.modLogChannel : null,
    vocChannelId: typeof patch.vocChannelId === "string" ? patch.vocChannelId : null,

    antispam: typeof patch.antispam === "boolean" ? patch.antispam : undefined,
    antilink: typeof patch.antilink === "boolean" ? patch.antilink : undefined,
    antiBadWords: typeof patch.antiBadWords === "boolean" ? patch.antiBadWords : undefined,
    autoSanction: typeof patch.autoSanction === "boolean" ? patch.autoSanction : undefined,
    antiRaid: typeof patch.antiRaid === "boolean" ? patch.antiRaid : undefined,

    language: cleanLanguage && ["fr", "en", "es"].includes(cleanLanguage) ? cleanLanguage : undefined,
    badWords: cleanBadWords
  })

  return res.json({ guildId, config: next })
})

export default router
