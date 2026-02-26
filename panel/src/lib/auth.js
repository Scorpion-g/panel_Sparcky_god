// Helpers d'auth côté front (JWT stocké en localStorage)

const JWT_KEY = "jwt"

export function getJwt() {
  return localStorage.getItem(JWT_KEY)
}

export function setJwt(token) {
  if (!token) return
  localStorage.setItem(JWT_KEY, token)
}

export function clearJwt() {
  localStorage.removeItem(JWT_KEY)
}

export function getTokenFromUrl(search = window.location.search) {
  const urlParams = new URLSearchParams(search)
  return urlParams.get("token")
}

export function clearTokenFromUrl() {
  const url = new URL(window.location.href)
  url.searchParams.delete("token")
  window.history.replaceState({}, "", url.toString())
}

