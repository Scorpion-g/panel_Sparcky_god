import express from "express"
import { authenticate } from "../middlewares/auth.js"
import { getDb } from "../lib/mongo.js"
import {
  assertCollectionAllowed,
  clampLimit,
  clampSkip,
  listAllowedCollections,
  normalizeFilter,
  normalizeProjection,
  normalizeSort,
  parseIdStrict,
  parseJsonQueryParam,
  sanitizeInsert,
  sanitizePatch
} from "../lib/devDbAdmin.js"

const router = express.Router()

// Admin DB DEV: endpoints génériques pour configurer plusieurs collections.
// Sécurité:
// - nécessite JWT
// - autorisé seulement en dev/test (ou si ENABLE_DEV_DB_ADMIN=true)
// - allowlist via DEV_DB_ALLOWED_COLLECTIONS (CSV)

router.get("/dev-db/collections", authenticate, async (_req, res) => {
  try {
    const db = await getDb()
    const allowed = await listAllowedCollections(db)

    // On renvoie uniquement celles qui existent vraiment (évite confusion côté UI)
    const existing = await db.listCollections({}, { nameOnly: true }).toArray()
    const existingNames = new Set(existing.map(c => c.name))

    const collections = allowed.filter(n => existingNames.has(n)).sort()

    return res.json({ db: db.databaseName, collections, allowed })
  } catch (e) {
    return res.status(e?.status || 500).json({ error: e?.message || "Failed" })
  }
})

router.get("/dev-db/:collection/documents", authenticate, async (req, res) => {
  const { collection } = req.params

  try {
    const db = await getDb()
    const name = await assertCollectionAllowed(db, collection)

    const limit = clampLimit(req.query.limit, { def: 20, max: 50 })
    const skip = clampSkip(req.query.skip, { def: 0, max: 100_000 })

    // filtre générique via JSON string
    // ex: ?filter={"guildId":"123"}
    const rawFilter = parseJsonQueryParam(req.query.filter, { def: undefined })
    const rawSort = parseJsonQueryParam(req.query.sort, { def: undefined })
    const rawProjection = parseJsonQueryParam(req.query.projection, { def: undefined })

    // compat legacy: ?guildId=...
    const legacyGuildId = typeof req.query.guildId === "string" ? req.query.guildId.trim() : ""

    let filter = normalizeFilter(rawFilter)
    if (legacyGuildId) {
      filter = { ...filter, guildId: legacyGuildId }
    }

    const sort = normalizeSort(rawSort)
    const projection = normalizeProjection(rawProjection)

    const col = db.collection(name)

    const total = await col.countDocuments(filter)
    let cursor = col.find(filter, projection ? { projection } : undefined)
    if (sort) cursor = cursor.sort(sort)
    cursor = cursor.skip(skip).limit(limit)

    const docs = await cursor.toArray()

    return res.json({
      db: db.databaseName,
      collection: name,
      filter,
      sort: sort || null,
      projection: projection || null,
      limit,
      skip,
      total,
      documents: docs
    })
  } catch (e) {
    return res.status(e?.status || 500).json({
      error: e?.message || "Failed",
      ...(e?.meta ? { meta: e.meta } : {})
    })
  }
})

router.get("/dev-db/:collection/documents/:id", authenticate, async (req, res) => {
  const { collection, id } = req.params

  try {
    const db = await getDb()
    const name = await assertCollectionAllowed(db, collection)

    const parsed = parseIdStrict(id)
    const query = typeof parsed === "object" ? { _id: parsed } : { _id: String(parsed) }

    const doc = await db.collection(name).findOne(query)
    if (!doc) return res.status(404).json({ error: "Document not found" })

    return res.json({ db: db.databaseName, collection: name, query, document: doc })
  } catch (e) {
    return res.status(e?.status || 500).json({
      error: e?.message || "Failed",
      ...(e?.meta ? { meta: e.meta } : {})
    })
  }
})

router.post("/dev-db/:collection/documents", authenticate, async (req, res) => {
  const { collection } = req.params

  try {
    const db = await getDb()
    const name = await assertCollectionAllowed(db, collection)

    const doc = sanitizeInsert(req.body)

    const result = await db.collection(name).insertOne({
      ...doc,
      createdAt: doc.createdAt ? doc.createdAt : new Date(),
      updatedAt: doc.updatedAt ? doc.updatedAt : new Date()
    })

    const created = await db.collection(name).findOne({ _id: result.insertedId })

    return res.status(201).json({ ok: true, db: db.databaseName, collection: name, document: created })
  } catch (e) {
    return res.status(e?.status || 500).json({
      error: e?.message || "Failed",
      ...(e?.meta ? { meta: e.meta } : {})
    })
  }
})

router.patch("/dev-db/:collection/documents/:id", authenticate, async (req, res) => {
  const { collection, id } = req.params

  try {
    const db = await getDb()
    const name = await assertCollectionAllowed(db, collection)

    const parsed = parseIdStrict(id)
    const query = typeof parsed === "object" ? { _id: parsed } : { _id: String(parsed) }

    const patch = sanitizePatch(req.body)

    await db.collection(name).updateOne(query, {
      $set: {
        ...patch,
        updatedAt: new Date()
      }
    })

    const doc = await db.collection(name).findOne(query)
    if (!doc) return res.status(404).json({ error: "Document not found" })

    return res.json({ ok: true, db: db.databaseName, collection: name, query, document: doc })
  } catch (e) {
    return res.status(e?.status || 500).json({
      error: e?.message || "Failed",
      ...(e?.meta ? { meta: e.meta } : {})
    })
  }
})

router.put("/dev-db/:collection/documents/:id", authenticate, async (req, res) => {
  const { collection, id } = req.params

  try {
    const db = await getDb()
    const name = await assertCollectionAllowed(db, collection)

    const parsed = parseIdStrict(id)
    const query = typeof parsed === "object" ? { _id: parsed } : { _id: String(parsed) }

    const replacement = sanitizeInsert(req.body)

    // replaceOne = doc complet; on impose le même _id que celui de l'URL
    const docToStore = { ...replacement, _id: query._id, updatedAt: new Date() }

    await db.collection(name).replaceOne(query, docToStore, { upsert: false })

    const doc = await db.collection(name).findOne(query)
    if (!doc) return res.status(404).json({ error: "Document not found" })

    return res.json({ ok: true, db: db.databaseName, collection: name, query, document: doc })
  } catch (e) {
    return res.status(e?.status || 500).json({
      error: e?.message || "Failed",
      ...(e?.meta ? { meta: e.meta } : {})
    })
  }
})

router.delete("/dev-db/:collection/documents/:id", authenticate, async (req, res) => {
  const { collection, id } = req.params

  try {
    const db = await getDb()
    const name = await assertCollectionAllowed(db, collection)

    const parsed = parseIdStrict(id)
    const query = typeof parsed === "object" ? { _id: parsed } : { _id: String(parsed) }

    const result = await db.collection(name).deleteOne(query)
    if (!result.deletedCount) return res.status(404).json({ error: "Document not found" })

    return res.json({ ok: true, db: db.databaseName, collection: name, query })
  } catch (e) {
    return res.status(e?.status || 500).json({
      error: e?.message || "Failed",
      ...(e?.meta ? { meta: e.meta } : {})
    })
  }
})

router.get("/dev-db/:collection/by-guild/:guildId", authenticate, async (req, res) => {
  const { collection, guildId } = req.params

  try {
    const db = await getDb()
    const name = await assertCollectionAllowed(db, collection)

    const doc = await db.collection(name).findOne({ guildId: String(guildId) })
    if (!doc) return res.status(404).json({ error: "Document not found" })

    return res.json({ db: db.databaseName, collection: name, query: { guildId: String(guildId) }, document: doc })
  } catch (e) {
    return res.status(e?.status || 500).json({
      error: e?.message || "Failed",
      ...(e?.meta ? { meta: e.meta } : {})
    })
  }
})

router.put("/dev-db/:collection/by-guild/:guildId", authenticate, async (req, res) => {
  const { collection, guildId } = req.params

  try {
    const db = await getDb()
    const name = await assertCollectionAllowed(db, collection)

    const patch = sanitizePatch(req.body)

    await db.collection(name).updateOne(
      { guildId: String(guildId) },
      {
        $set: {
          ...patch,
          updatedAt: new Date()
        },
        $setOnInsert: {
          guildId: String(guildId),
          createdAt: new Date()
        }
      },
      { upsert: true }
    )

    const doc = await db.collection(name).findOne({ guildId: String(guildId) })
    return res.json({ ok: true, db: db.databaseName, collection: name, query: { guildId: String(guildId) }, document: doc })
  } catch (e) {
    return res.status(e?.status || 500).json({
      error: e?.message || "Failed",
      ...(e?.meta ? { meta: e.meta } : {})
    })
  }
})

router.get("/dev-db/:collection/by-user/:guildId/:userId", authenticate, async (req, res) => {
  const { collection, guildId, userId } = req.params

  try {
    const db = await getDb()
    const name = await assertCollectionAllowed(db, collection)

    const doc = await db.collection(name).findOne({ guildId: String(guildId), userId: String(userId) })
    if (!doc) return res.status(404).json({ error: "Document not found" })

    return res.json({
      db: db.databaseName,
      collection: name,
      query: { guildId: String(guildId), userId: String(userId) },
      document: doc
    })
  } catch (e) {
    return res.status(e?.status || 500).json({
      error: e?.message || "Failed",
      ...(e?.meta ? { meta: e.meta } : {})
    })
  }
})

router.put("/dev-db/:collection/by-user/:guildId/:userId", authenticate, async (req, res) => {
  const { collection, guildId, userId } = req.params

  try {
    const db = await getDb()
    const name = await assertCollectionAllowed(db, collection)

    const patch = sanitizePatch(req.body)

    await db.collection(name).updateOne(
      { guildId: String(guildId), userId: String(userId) },
      {
        $set: {
          ...patch,
          updatedAt: new Date()
        },
        $setOnInsert: {
          guildId: String(guildId),
          userId: String(userId),
          createdAt: new Date()
        }
      },
      { upsert: true }
    )

    const doc = await db.collection(name).findOne({ guildId: String(guildId), userId: String(userId) })

    return res.json({
      ok: true,
      db: db.databaseName,
      collection: name,
      query: { guildId: String(guildId), userId: String(userId) },
      document: doc
    })
  } catch (e) {
    return res.status(e?.status || 500).json({
      error: e?.message || "Failed",
      ...(e?.meta ? { meta: e.meta } : {})
    })
  }
})

export default router

