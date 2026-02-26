import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate, Link } from "react-router-dom"
import { clearJwt, getJwt } from "../lib/auth"

const API_BASE_URL = "http://localhost:3001"

const DISCORD_PERM_ADMINISTRATOR = 1n << 3n

function isAdminGuild(guild) {
  // Discord renvoie `permissions` (string) quand on appelle /users/@me/guilds
  // https://discord.com/developers/docs/resources/user#get-current-user-guilds
  try {
    const perms = BigInt(guild?.permissions ?? "0")
    return (perms & DISCORD_PERM_ADMINISTRATOR) === DISCORD_PERM_ADMINISTRATOR
  } catch {
    return false
  }
}

function Avatar({ user, size = 40 }) {
  const initials = useMemo(() => {
    const name = user?.username || user?.name || "?"
    return name.slice(0, 2).toUpperCase()
  }, [user])

  const src = user?.avatarUrl

  return (
    <div
      className="relative overflow-hidden rounded-2xl bg-white/5 ring-1 ring-white/10"
      style={{ height: size, width: size }}
    >
      {src ? (
        <img src={src} alt={user?.username ?? "Avatar"} className="h-full w-full object-cover" />
      ) : (
        <div className="grid h-full w-full place-items-center text-xs font-semibold text-slate-200">
          {initials}
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, hint }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
      <p className="text-xs font-medium text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-100">{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-400">{hint}</p> : null}
    </div>
  )
}

function BotCard({ bot }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-slate-400">Bot</p>
          <p className="mt-2 text-lg font-semibold tracking-tight text-slate-100">{bot?.username ?? "—"}</p>
          <p className="mt-1 text-xs text-slate-400">ID: {bot?.id ?? "—"}</p>
        </div>
        {bot ? <Avatar user={{ username: bot.username, avatarUrl: bot.avatarUrl }} size={44} /> : null}
      </div>
    </div>
  )
}

function GuildRow({ guild }) {
  const initial = (guild?.name || "?").slice(0, 1).toUpperCase()
  const admin = isAdminGuild(guild)

  return (
    <Link
      to={`/guild/${guild.id}`}
      className="block rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 transition hover:bg-slate-950/55 focus:outline-none focus:ring-2 focus:ring-indigo-300/60"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {guild?.iconUrl ? (
            <img
              src={guild.iconUrl}
              alt={`Icône ${guild.name}`}
              className="h-9 w-9 shrink-0 rounded-2xl object-cover ring-1 ring-white/10"
              loading="lazy"
            />
          ) : (
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-indigo-600/20 text-sm font-semibold text-indigo-200 ring-1 ring-indigo-400/20">
              {initial}
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-100">{guild.name}</p>
            <p className="truncate text-xs text-slate-400">ID: {guild.id}</p>
          </div>
        </div>

        {admin ? (
          <span className="shrink-0 rounded-full bg-rose-500/15 px-2 py-1 text-[11px] font-semibold text-rose-200 ring-1 ring-rose-500/30">
            Admin
          </span>
        ) : (
          <span className="shrink-0 rounded-full bg-white/5 px-2 py-1 text-[11px] text-slate-300 ring-1 ring-white/10">
            Membre
          </span>
        )}
      </div>
    </Link>
  )
}

export default function Dashboard() {
  const navigate = useNavigate()

  const [status, setStatus] = useState("loading") // loading | ready | error
  const [error, setError] = useState(null)
  const [user, setUser] = useState(null)
  const [bot, setBot] = useState(null)
  const [guilds, setGuilds] = useState([])

  const [refreshCooldownUntil, setRefreshCooldownUntil] = useState(0)
  const retryTimeoutRef = useRef(null)

  // Recherche / tri / pagination
  const [search, setSearch] = useState("")
  const [sortKey, setSortKey] = useState("name") // name | id
  const [sortDir, setSortDir] = useState("asc") // asc | desc
  const [pageSize, setPageSize] = useState(10)
  const [page, setPage] = useState(1)

  const [adminOnly, setAdminOnly] = useState(false)

  const token = useMemo(() => getJwt(), [])

  function logout() {
    clearJwt()
    navigate("/login", { replace: true })
  }

  async function load({ reason = "auto" } = {}) {
    setStatus("loading")
    setError(null)

    try {
      const res = await fetch(`${API_BASE_URL}/api/me`, {
        headers: { Authorization: `Bearer ${token}` }
      })

      if (res.status === 401) {
        clearJwt()
        navigate("/login", { replace: true })
        return
      }

      if (!res.ok) {
        const contentType = res.headers.get("content-type") || ""
        const isJson = contentType.includes("application/json")

        const payload = isJson ? await res.json().catch(() => null) : null
        const detailsText = isJson ? (payload?.error || payload?.message || JSON.stringify(payload)) : await res.text().catch(() => "")
        const retryAfter = isJson ? (payload?.retry_after ?? null) : null

        const trimmed = detailsText ? String(detailsText).slice(0, 200) : ""

        if (res.status === 429) {
          const retryMs = typeof retryAfter === "number" ? Math.max(250, Math.ceil(retryAfter * 1000)) : 1000
          const until = Date.now() + retryMs
          setRefreshCooldownUntil(until)

          const wait = typeof retryAfter === "number" ? `${retryAfter.toFixed(1)}s` : "un court instant"
          setError(`Rate limit Discord — réessaie dans ${wait}.`)
          setStatus("error")

          if (reason !== "auto") {
            if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current)
            retryTimeoutRef.current = setTimeout(() => {
              load({ reason: "auto" })
            }, retryMs)
          }

          return
        }

        setError(trimmed ? `Erreur API (${res.status}) — ${trimmed}` : `Erreur API (${res.status})`)
        setStatus("error")
        return
      }

      const data = await res.json()

      setUser(data.user)
      setBot(data.bot ?? null)
      setGuilds(Array.isArray(data.guilds) ? data.guilds : [])
      setStatus("ready")
    } catch (e) {
      setError(e?.message || "Erreur inconnue")
      setStatus("error")
    }
  }

  useEffect(() => {
    if (!token) {
      logout()
      return
    }

    load({ reason: "auto" })

    return () => {
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const refreshDisabled = refreshCooldownUntil && Date.now() < refreshCooldownUntil

  const adminCount = useMemo(() => guilds.filter(isAdminGuild).length, [guilds])

  const filteredSortedGuilds = useMemo(() => {
    const q = search.trim().toLowerCase()

    let items = guilds

    if (adminOnly) {
      items = items.filter(isAdminGuild)
    }

    if (q) {
      items = items.filter(g => {
        const name = String(g?.name ?? "").toLowerCase()
        const id = String(g?.id ?? "")
        return name.includes(q) || id.includes(q)
      })
    }

    const dir = sortDir === "asc" ? 1 : -1
    items = [...items].sort((a, b) => {
      if (sortKey === "id") {
        const av = String(a?.id ?? "")
        const bv = String(b?.id ?? "")
        return av.localeCompare(bv) * dir
      }

      const av = String(a?.name ?? "").toLowerCase()
      const bv = String(b?.name ?? "").toLowerCase()
      return av.localeCompare(bv) * dir
    })

    return items
  }, [guilds, search, sortKey, sortDir, adminOnly])

  const totalItems = filteredSortedGuilds.length
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))

  const currentPage = Math.min(page, totalPages)
  const startIndex = (currentPage - 1) * pageSize
  const pagedGuilds = filteredSortedGuilds.slice(startIndex, startIndex + pageSize)

  useEffect(() => {
    // si le filtre réduit le nombre de pages, on se remet sur une page valide
    if (page !== currentPage) setPage(currentPage)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage])

  useEffect(() => {
    // reset page quand on change filtre/tri/taille
    setPage(1)
  }, [search, sortKey, sortDir, pageSize])

  const handleKeyDown = e => {
    if (e.key === "Enter") {
      e.preventDefault()
      load({ reason: "manual" })
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-slate-100">
      <header className="border-b border-white/10 bg-slate-950/40 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-white/5 ring-1 ring-white/10">
              <span className="text-sm font-semibold text-indigo-200">SP</span>
            </div>
            <div>
              <p className="text-sm font-semibold leading-tight">Panel Sparcky</p>
              <p className="text-xs text-slate-400">Dashboard</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {user ? (
              <>
                <div className="hidden text-right sm:block">
                  <p className="text-sm font-semibold leading-tight">{user.username}</p>
                  <p className="text-xs text-slate-400">ID: {user.id}</p>
                </div>
                <Avatar user={user} />
              </>
            ) : (
              <div className="h-10 w-32 animate-pulse rounded-2xl bg-white/5 ring-1 ring-white/10" />
            )}

            <button
              type="button"
              onClick={logout}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-indigo-300/60"
            >
              Déconnexion
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="grid gap-6 md:grid-cols-3">
          <StatCard
            label="Statut"
            value={status === "ready" ? "Connecté" : status === "loading" ? "Chargement" : "Erreur"}
            hint={status === "error" ? (error ?? "—") : ""}
          />
          <StatCard
            label="Guildes"
            value={status === "ready" ? guilds.length : "—"}
            hint={status === "ready" ? `${adminCount} admin` : "Serveurs visibles via l’API"}
          />
          <BotCard bot={bot} />
        </div>

        <section className="mt-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Tes guildes</h2>
              <p className="mt-1 text-sm text-slate-300">
                Recherche, tri et pagination (badges Admin en rouge).
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={refreshDisabled}
                onClick={() => load({ reason: "manual" })}
                className={`rounded-xl px-3 py-2 text-xs font-semibold text-white shadow-lg shadow-indigo-600/20 transition focus:outline-none focus:ring-2 focus:ring-indigo-300/60 ${
                  refreshDisabled ? "bg-indigo-600/40 cursor-not-allowed" : "bg-indigo-600 hover:bg-indigo-500"
                }`}
                title={refreshDisabled ? "Attends un instant avant de rafraîchir" : "Rafraîchir"}
              >
                Rafraîchir
              </button>
            </div>
          </div>

          <div className="mt-4 rounded-3xl border border-white/10 bg-white/5 p-4">
            {/* Barre de contrôles */}
            {status === "ready" && (
              <div className="mb-4 grid gap-3 md:grid-cols-4">
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-slate-300">Recherche</label>
                  <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Nom ou ID…"
                    className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none ring-0 focus:border-indigo-400/40"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300">Filtre</label>
                  <button
                    type="button"
                    onClick={() => setAdminOnly(v => !v)}
                    className={`mt-1 flex w-full items-center justify-between rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                      adminOnly
                        ? "border-rose-500/30 bg-rose-500/10 text-rose-100"
                        : "border-white/10 bg-slate-950/40 text-slate-100 hover:bg-slate-950/55"
                    }`}
                    title="Afficher uniquement les serveurs où tu es admin"
                  >
                    <span>Admin only</span>
                    <span className={`text-xs ${adminOnly ? "text-rose-200" : "text-slate-400"}`}>{
                      adminOnly ? "ON" : "OFF"
                    }</span>
                  </button>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300">Trier / Page</label>
                  <div className="mt-1 flex gap-2">
                    <select
                      value={sortKey}
                      onChange={e => setSortKey(e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-400/40"
                    >
                      <option value="name">Nom</option>
                      <option value="id">ID</option>
                    </select>
                    <select
                      value={sortDir}
                      onChange={e => setSortDir(e.target.value)}
                      className="w-28 rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-400/40"
                    >
                      <option value="asc">Asc</option>
                      <option value="desc">Desc</option>
                    </select>
                    <select
                      value={pageSize}
                      onChange={e => setPageSize(Number(e.target.value))}
                      className="w-24 rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-400/40"
                      title="Taille de page"
                    >
                      <option value={5}>5</option>
                      <option value={10}>10</option>
                      <option value={20}>20</option>
                      <option value={50}>50</option>
                    </select>
                  </div>
                </div>

                <div className="md:col-span-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/10 bg-slate-950/30 px-3 py-2">
                  <p className="text-xs text-slate-300">
                    {totalItems} résultat(s) • page {currentPage}/{totalPages}
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setPage(1)}
                      disabled={currentPage === 1}
                      className={`rounded-lg px-2 py-1 text-xs font-semibold ring-1 ring-white/10 ${
                        currentPage === 1 ? "bg-white/5 text-slate-500" : "bg-white/10 text-slate-100 hover:bg-white/15"
                      }`}
                    >
                      «
                    </button>
                    <button
                      type="button"
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className={`rounded-lg px-2 py-1 text-xs font-semibold ring-1 ring-white/10 ${
                        currentPage === 1 ? "bg-white/5 text-slate-500" : "bg-white/10 text-slate-100 hover:bg-white/15"
                      }`}
                    >
                      Préc.
                    </button>
                    <button
                      type="button"
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage >= totalPages}
                      className={`rounded-lg px-2 py-1 text-xs font-semibold ring-1 ring-white/10 ${
                        currentPage >= totalPages
                          ? "bg-white/5 text-slate-500"
                          : "bg-white/10 text-slate-100 hover:bg-white/15"
                      }`}
                    >
                      Suiv.
                    </button>
                    <button
                      type="button"
                      onClick={() => setPage(totalPages)}
                      disabled={currentPage >= totalPages}
                      className={`rounded-lg px-2 py-1 text-xs font-semibold ring-1 ring-white/10 ${
                        currentPage >= totalPages
                          ? "bg-white/5 text-slate-500"
                          : "bg-white/10 text-slate-100 hover:bg-white/15"
                      }`}
                    >
                      »
                    </button>
                  </div>
                </div>
              </div>
            )}

            {status === "loading" && (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-14 animate-pulse rounded-2xl bg-slate-950/40 ring-1 ring-white/10" />
                ))}
              </div>
            )}

            {status === "error" && (
              <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-100">
                <p className="font-semibold">Impossible de charger tes infos</p>
                <p className="mt-1 text-rose-100/80">{error}</p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => load({ reason: "manual" })}
                    className="rounded-xl bg-rose-500/80 px-3 py-2 text-xs font-semibold text-white transition hover:bg-rose-500"
                  >
                    Réessayer
                  </button>
                  <button
                    type="button"
                    onClick={logout}
                    className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-100 transition hover:bg-white/10"
                  >
                    Se déconnecter
                  </button>
                </div>
              </div>
            )}

            {status === "ready" && totalItems === 0 && (
              <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-6 text-sm text-slate-300">
                Aucun résultat.
              </div>
            )}

            {status === "ready" && totalItems > 0 && (
              <div className="space-y-3">
                {pagedGuilds.map(guild => (
                  <GuildRow key={guild.id} guild={guild} />
                ))}
              </div>
            )}
          </div>
        </section>

        <footer className="mt-10 text-center text-xs text-slate-400">Panel UI — Tailwind • React • Vite</footer>
      </main>
    </div>
  )
}
