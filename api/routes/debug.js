import express from "express"
import { authenticate } from "../middlewares/auth.js"
import { getDb } from "../lib/mongo.js"

const router = express.Router()

// Debug sécurisé (nécessite JWT). Ne renvoie pas de secrets, juste des infos DB.
router.get("/debug/mongo/collections", authenticate, async (req, res) => {
  try {
    const db = await getDb()
    const collections = await db.listCollections().toArray()
    return res.json({
      db: db.databaseName,
      collections: collections.map(c => c.name).sort()
    })
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Failed to list collections" })
  }
})

router.get("/debug/mongo/guild-config/:guildId", authenticate, async (req, res) => {
  const { guildId } = req.params
  const collection = req.query.collection

  try {
    const db = await getDb()

    const guessNames = [
      "guildconfigurations",
      "GuildConfigurations",
      "GuildConfiguration",
      "guildConfigurations",
      "guild_configs"
    ]

    const names = [collection, ...guessNames].filter(Boolean)

    const found = []
    for (const name of names) {
      const doc = await db.collection(String(name)).findOne({ guildId })
      if (doc) {
        found.push({ collection: name, doc })
      }
    }

    return res.json({ guildId, tried: names, found })
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Failed to read guild config" })
  }
})

export default router

