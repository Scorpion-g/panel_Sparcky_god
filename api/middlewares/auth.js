import jwt from "jsonwebtoken"

export function authenticate(req, res, next) {
  const authHeader = req.headers.authorization

  if (!authHeader) {
    return res.status(401).json({ error: "Missing Authorization header" })
  }

  // Supporte: "Bearer <token>" (standard)
  const parts = authHeader.split(" ").filter(Boolean)
  const token = parts.length >= 2 ? parts[1] : null

  if (!token) {
    return res.status(401).json({ error: "Missing token" })
  }

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET)
    next()
  } catch (e) {
    if (e?.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Token expired" })
    }
    return res.status(401).json({ error: "Invalid token" })
  }
}
