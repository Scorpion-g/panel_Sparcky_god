import { ObjectId } from "mongodb"

function isDevDbAdminEnabled() {
  // Activé uniquement si explicitement demandé OU si on est en dev/test.
  // Par défaut en production: désactivé.
  const flag = String(process.env.ENABLE_DEV_DB_ADMIN || "").toLowerCase()
  if (["1", "true", "yes", "on"].includes(flag)) return true

  const env = String(process.env.NODE_ENV || "development").toLowerCase()
  return env !== "production"
}

export function assertDevDbAdminEnabled() {
  if (!isDevDbAdminEnabled()) {
    const err = new Error("Dev DB admin is disabled")
    err.status = 403
    throw err
  }
}

function parseAllowedCollections() {
  // CSV: "guildconfigurations,logs,whatever"
  const raw = String(process.env.DEV_DB_ALLOWED_COLLECTIONS || "").trim()
  if (!raw) return null
  const allowed = raw
    .split(",")
    .map(s => s.trim())
    .filter(Boolean)
  return allowed.length ? new Set(allowed) : null
}

export function getAllowedCollectionsFallback() {
  // Fallback raisonnable si l'env n'est pas définie.
  // IMPORTANT: on n'expose PAS toutes les collections par défaut.
  const base = [
    process.env.BOT_GUILD_CONFIG_COLLECTION || "guildconfigurations",
    "logs",
    "botconfigurations",
    "botconfigs"
  ]
    .map(String)
    .filter(Boolean)

  // dédoublonnage
  return [...new Set(base)]
}

export async function listAllowedCollections(db) {
  assertDevDbAdminEnabled()

  const allowset = parseAllowedCollections()
  if (allowset) return [...allowset].sort()

  // fallback: on ne vérifie pas l'existence, on propose juste un set minimal.
  return getAllowedCollectionsFallback().sort()
}

export async function assertCollectionAllowed(db, collectionName) {
  assertDevDbAdminEnabled()

  const name = String(collectionName || "").trim()
  if (!name) {
    const err = new Error("Missing collection")
    err.status = 400
    throw err
  }

  // Stop net les noms chelous
  if (!/^[a-zA-Z0-9._-]{1,120}$/.test(name)) {
    const err = new Error("Invalid collection name")
    err.status = 400
    throw err
  }

  const allowed = await listAllowedCollections(db)
  if (!allowed.includes(name)) {
    const err = new Error("Collection not allowed")
    err.status = 403
    err.meta = { allowed }
    throw err
  }

  return name
}

export function clampLimit(raw, { min = 1, max = 50, def = 20 } = {}) {
  const n = Number(raw)
  if (!Number.isFinite(n)) return def
  return Math.max(min, Math.min(max, Math.trunc(n)))
}

export function clampSkip(raw, { max = 10_000, def = 0 } = {}) {
  const n = Number(raw)
  if (!Number.isFinite(n)) return def
  return Math.max(0, Math.min(max, Math.trunc(n)))
}

export function parseIdMaybe(id) {
  const str = String(id || "").trim()
  if (!str) return null
  if (/^[0-9a-fA-F]{24}$/.test(str)) {
    return new ObjectId(str)
  }
  return str
}

export function parseIdStrict(id) {
  const parsed = parseIdMaybe(id)
  if (!parsed) {
    const err = new Error("Missing id")
    err.status = 400
    throw err
  }
  return parsed
}

function isPlainObject(v) {
  return v && typeof v === "object" && !Array.isArray(v)
}

export function assertNoMongoOperators(value, { path = "" } = {}) {
  // Refuse toute clé commençant par '$' (ex: $where, $gt, ...)
  // On autorise quand même les arrays comme containers, mais on check leurs éléments.
  if (Array.isArray(value)) {
    value.forEach((item, i) => assertNoMongoOperators(item, { path: `${path}[${i}]` }))
    return
  }

  if (!isPlainObject(value)) return

  for (const [k, v] of Object.entries(value)) {
    if (k.startsWith("$")) {
      const err = new Error(`Mongo operator not allowed at ${path ? path + "." : ""}${k}`)
      err.status = 400
      throw err
    }
    assertNoMongoOperators(v, { path: `${path ? path + "." : ""}${k}` })
  }
}

export function parseJsonQueryParam(raw, { def = undefined, maxLen = 20_000 } = {}) {
  if (raw === undefined || raw === null || raw === "") return def
  const str = String(raw)
  if (str.length > maxLen) {
    const err = new Error("JSON query param too large")
    err.status = 400
    throw err
  }
  try {
    return JSON.parse(str)
  } catch {
    const err = new Error("Invalid JSON in query")
    err.status = 400
    throw err
  }
}

export function normalizeFilter(rawFilter) {
  const filter = isPlainObject(rawFilter) ? rawFilter : {}
  assertNoMongoOperators(filter)
  return filter
}

export function normalizeProjection(rawProjection) {
  if (rawProjection === undefined) return undefined
  const projection = isPlainObject(rawProjection) ? rawProjection : undefined
  if (projection) assertNoMongoOperators(projection)
  return projection
}

export function normalizeSort(rawSort) {
  if (rawSort === undefined) return undefined
  const sort = isPlainObject(rawSort) ? rawSort : undefined
  if (sort) assertNoMongoOperators(sort)
  return sort
}

export function sanitizeInsert(doc) {
  const obj = doc && typeof doc === "object" ? doc : {}
  assertNoMongoOperators(obj)
  return obj
}

export function sanitizePatch(patch) {
  const obj = patch && typeof patch === "object" ? patch : {}
  assertNoMongoOperators(obj)

  // On refuse les modifs d'_id et de quelques champs metadata
  // eslint-disable-next-line no-unused-vars
  const { _id, createdAt, updatedAt, ...rest } = obj

  return rest
}
