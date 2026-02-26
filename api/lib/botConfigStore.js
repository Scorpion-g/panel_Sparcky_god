// Stockage config bot ultra-simple (mémoire) par guilde.
// Remarque: en prod, remplace par une DB (SQLite/Postgres/Redis) pour persister.

const store = new Map()

export function getGuildConfig(guildId) {
  if (!guildId) return null
  return store.get(guildId) ?? {
    prefix: "!",
    logChannelId: null,
    welcomeEnabled: false
  }
}

export function setGuildConfig(guildId, patch) {
  const current = getGuildConfig(guildId) || {}
  const next = { ...current, ...patch }
  store.set(guildId, next)
  return next
}

