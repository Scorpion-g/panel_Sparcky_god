import "dotenv/config"
import express from "express"
import cors from "cors"
import authRoutes from "./routes/auth.js"

import meRoutes from "./routes/me.js"
import guildRoutes from "./routes/guilds.js"
import logsRoutes from "./routes/logs.js"
import debugRoutes from "./routes/debug.js"
import devDbRoutes from "./routes/devDb.js"

const app = express()

app.use(cors())
app.use(express.json())

app.get("/ping", (_req, res) => res.json({ ok: true }))

app.use("/auth", authRoutes)

app.use("/api", meRoutes)
app.use("/api", guildRoutes)
app.use("/api", logsRoutes)
app.use("/api", debugRoutes)
app.use("/api", devDbRoutes)

app.listen(3001, () => {
  console.log("API running on http://localhost:3001")
})
