import { clearJwt, getJwt } from "./auth"

const API_BASE_URL = "http://localhost:3001"

export async function apiFetch(path, { method = "GET", body, headers } = {}) {
  const token = getJwt()

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(headers || {})
    },
    body: body !== undefined ? JSON.stringify(body) : undefined
  })

  if (res.status === 401) {
    clearJwt()
  }

  const ct = res.headers.get("content-type") || ""
  const isJson = ct.includes("application/json")
  const payload = isJson ? await res.json().catch(() => null) : await res.text().catch(() => "")

  if (!res.ok) {
    const message =
      typeof payload === "string" && payload
        ? payload
        : payload?.error || payload?.message || `Erreur API (${res.status})`
    const err = new Error(message)
    err.status = res.status
    err.payload = payload
    throw err
  }

  return payload
}

