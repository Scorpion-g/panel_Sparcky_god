import { MongoClient } from "mongodb"

let client
let db

export async function getDb() {
  if (db) return db

  const uri = process.env.MONGODB_URI
  const dbName = process.env.MONGODB_DB || "sparcky"

  if (!uri) {
    throw new Error("Missing MONGODB_URI")
  }

  client = new MongoClient(uri)
  await client.connect()

  db = client.db(dbName)
  return db
}

export async function closeDb() {
  if (client) {
    await client.close()
  }
  client = undefined
  db = undefined
}

