import { getDb } from "./mongo.js"

// Mongoose pluralise `GuildConfiguration` => `guildconfigurations` (par défaut).
// Si ton bot utilise un autre nom, change ici.
const COLLECTION = process.env.BOT_GUILD_CONFIG_COLLECTION || "guildconfigurations"

export function defaultGuildConfig() {
  return {
    guildId: null,
    welcomeChannel: null,
    leaveChannel: null,
    autoRole: null,
    antispam: false,
    antilink: false,
    modLogChannel: null,
    antiBadWords: false,
    badWords: [],
    autoSanction: false,
    antiRaid: false,
    language: "fr",
    vocChannelId: null
  }
}

function normalizeDoc(doc, guildId) {
  if (!doc) return { ...defaultGuildConfig(), guildId }

  // Certains champs peuvent venir en undefined: on remet des defaults.
  const cfg = { ...defaultGuildConfig(), ...doc }
  cfg.guildId = guildId || cfg.guildId

  if (!Array.isArray(cfg.badWords)) cfg.badWords = []

  return cfg
}

export async function getGuildConfig(guildId) {
  if (!guildId) return null
  const db = await getDb()

  const doc = await db.collection(COLLECTION).findOne({ guildId })
  return normalizeDoc(doc, guildId)
}

export async function setGuildConfig(guildId, patch) {
  if (!guildId) return null
  const db = await getDb()

  const current = await getGuildConfig(guildId)
  const next = {
    ...current,
    ...patch,
    guildId
  }

  // Normalisation légère
  if (!Array.isArray(next.badWords)) next.badWords = []

  // Important: ne pas réécrire des champs réservés/metadata
  // (sinon conflit si `createdAt` est déjà dans le doc et qu'on utilise $setOnInsert)
  // eslint-disable-next-line no-unused-vars
  const { _id, createdAt, updatedAt, ...cleanDoc } = next

  await db.collection(COLLECTION).updateOne(
    { guildId },
    {
      $set: {
        ...cleanDoc,
        updatedAt: new Date()
      },
      $setOnInsert: {
        createdAt: new Date()
      }
    },
    { upsert: true }
  )

  return next
}
