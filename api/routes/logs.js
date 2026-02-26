import express from "express"
import { authenticate } from "../middlewares/auth.js"
import axios from "axios"
import { getGuildConfig } from "../lib/guildConfigRepo.js"

const router = express.Router()

function getBotToken() {
  return process.env.DISCORD_BOT_TOKEN
}

function simplifyMessage(m) {
  return {
    id: m.id,
    channel_id: m.channel_id,
    timestamp: m.timestamp,
    content: m.content,
    author: m.author
      ? {
          id: m.author.id,
          username: m.author.username,
          global_name: m.author.global_name ?? null,
          avatar: m.author.avatar ?? null
        }
      : null
  }
}

router.get("/guilds/:guildId/logs", authenticate, async (req, res) => {
  const { guildId } = req.params
  const botToken = getBotToken()

  if (!botToken) {
    return res.status(500).json({ error: "Missing DISCORD_BOT_TOKEN" })
  }

  const limit = Math.min(100, Math.max(1, Number(req.query.limit || 50)))

  try {
    const config = await getGuildConfig(guildId)
    const channelId = config?.modLogChannel

    if (!channelId) {
      return res.status(400).json({ error: "No modLogChannel configured for this guild" })
    }

    // Lecture des messages via bot
    const messagesRes = await axios.get(`https://discord.com/api/channels/${channelId}/messages`, {
      headers: { Authorization: `Bot ${botToken}` },
      params: { limit }
    })

    const messages = Array.isArray(messagesRes.data) ? messagesRes.data.map(simplifyMessage) : []

    return res.json({ guildId, channelId, messages })
  } catch (err) {
    const status = err?.response?.status
    const data = err?.response?.data

    if (status === 403) {
      return res.status(403).json({ error: "Missing permissions to read log channel" })
    }

    if (status === 404) {
      return res.status(404).json({ error: "Log channel not found" })
    }

    console.error("/api/guilds/:guildId/logs error", { status, message: err?.message, data })
    return res.status(502).json({ error: "Failed to fetch logs" })
  }
})

export default router
