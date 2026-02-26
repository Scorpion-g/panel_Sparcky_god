
import express from "express"
import axios from "axios"
import jwt from "jsonwebtoken"

const router = express.Router()

router.get("/discord", (_, res) => {
  const params = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID,
    redirect_uri: process.env.DISCORD_REDIRECT_URI,
    response_type: "code",
    scope: "identify guilds"
  })

  res.redirect(`https://discord.com/oauth2/authorize?${params}`)
})

router.get("/discord/callback", async (req, res) => {
  const { code } = req.query

  try {
    const tokenRes = await axios.post(
      "https://discord.com/api/oauth2/token",
      new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID,
        client_secret: process.env.DISCORD_CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
        redirect_uri: process.env.DISCORD_REDIRECT_URI
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    )

    const { access_token } = tokenRes.data

    const userRes = await axios.get(
      "https://discord.com/api/users/@me",
      { headers: { Authorization: `Bearer ${access_token}` } }
    )

    const guildsRes = await axios.get(
      "https://discord.com/api/users/@me/guilds",
      { headers: { Authorization: `Bearer ${access_token}` } }
    )

    const jwtToken = jwt.sign(
      {
        id: userRes.data.id,
        username: userRes.data.username,
        avatar: userRes.data.avatar,
        access_token,
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    )

    res.redirect(`http://localhost:5173/login?token=${jwtToken}`)
  } catch (err) {
    console.error(err)
    res.status(500).send("OAuth error")
  }
})

export default router
