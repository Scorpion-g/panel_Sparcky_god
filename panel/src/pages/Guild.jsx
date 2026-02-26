import { useEffect, useMemo, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { clearJwt, getJwt } from "../lib/auth"

const API_BASE_URL = "http://localhost:3001"

function Pill({ tone = "neutral", children }) {
  const cls =
    tone === "success"
      ? "bg-emerald-500/15 text-emerald-100 ring-emerald-500/30"
      : tone === "danger"
        ? "bg-rose-500/15 text-rose-100 ring-rose-500/30"
        : "bg-white/5 text-slate-200 ring-white/10"

  return <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ring-1 ${cls}`}>{children}</span>
}

export default function GuildPage() {
  const navigate = useNavigate()
  const { id } = useParams()

  const token = useMemo(() => getJwt(), [])

  const [status, setStatus] = useState("loading") // loading | ready | error
  const [error, setError] = useState(null)
  const [data, setData] = useState(null)

  function logout() {
    clearJwt()
    navigate("/login", { replace: true })
  }

  useEffect(() => {
    let cancelled = false

    async function load() {
      setStatus("loading")
      setError(null)

      try {
        const res = await fetch(`${API_BASE_URL}/api/guilds/${id}`, {
          headers: { Authorization: `Bearer ${token}` }
        })

        if (res.status === 401) {
          logout()
          return
        }

        const ct = res.headers.get("content-type") || ""
        const isJson = ct.includes("application/json")

        if (!res.ok) {
          const payload = isJson ? await res.json().catch(() => null) : null
          const msg = payload?.error || payload?.message || `Erreur API (${res.status})`
          throw new Error(msg)
        }

        const payload = isJson ? await res.json() : null
        if (cancelled) return

        setData(payload)
        setStatus("ready")
      } catch (e) {
        if (cancelled) return
        setError(e?.message || "Erreur inconnue")
        setStatus("error")
      }
    }

    if (!token) {
      logout()
      return
    }

    if (!id) {
      setError("Guild ID manquant")
      setStatus("error")
      return
    }

    load()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const guild = data?.guild

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-slate-100">
      <header className="border-b border-white/10 bg-slate-950/40 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4">
          <div className="flex items-center gap-3">
            <Link
              to="/dashboard"
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-100 transition hover:bg-white/10"
            >
              ← Dashboard
            </Link>
            <div>
              <p className="text-sm font-semibold leading-tight">Détails serveur</p>
              <p className="text-xs text-slate-400">{id}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={logout}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-indigo-300/60"
          >
            Déconnexion
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        {status === "loading" && (
          <div className="space-y-3">
            <div className="h-24 animate-pulse rounded-3xl bg-white/5 ring-1 ring-white/10" />
            <div className="h-64 animate-pulse rounded-3xl bg-white/5 ring-1 ring-white/10" />
          </div>
        )}

        {status === "error" && (
          <div className="rounded-3xl border border-rose-500/20 bg-rose-500/10 p-6 text-sm text-rose-100">
            <p className="text-base font-semibold">Impossible de charger ce serveur</p>
            <p className="mt-2 text-rose-100/80">{error}</p>
          </div>
        )}

        {status === "ready" && (
          <>
            <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  {guild?.iconUrl ? (
                    <img
                      src={guild.iconUrl}
                      alt={`Icône ${guild?.name ?? "Guild"}`}
                      className="h-14 w-14 rounded-3xl object-cover ring-1 ring-white/10"
                    />
                  ) : (
                    <div className="grid h-14 w-14 place-items-center rounded-3xl bg-white/5 ring-1 ring-white/10">
                      <span className="text-lg font-semibold text-slate-200">{(guild?.name || "?").slice(0, 1)}</span>
                    </div>
                  )}

                  <div className="min-w-0">
                    <h1 className="truncate text-xl font-semibold tracking-tight">{guild?.name ?? "Serveur"}</h1>
                    <p className="mt-1 truncate text-sm text-slate-300">ID: {guild?.id ?? id}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {data?.botInGuild ? <Pill tone="success">Bot présent</Pill> : <Pill tone="danger">Bot absent</Pill>}
                      {guild?.owner_id ? <Pill>Owner: {guild.owner_id}</Pill> : null}
                    </div>
                  </div>
                </div>

                {data?.bot && (
                  <div className="hidden items-center gap-2 sm:flex">
                    {data.bot.avatarUrl ? (
                      <img
                        src={data.bot.avatarUrl}
                        alt={data.bot.username}
                        className="h-10 w-10 rounded-2xl object-cover ring-1 ring-white/10"
                      />
                    ) : null}
                    <div className="text-right">
                      <p className="text-sm font-semibold">{data.bot.username}</p>
                      <p className="text-xs text-slate-400">Bot</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-6 grid gap-6 md:grid-cols-2">
              <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
                <h2 className="text-sm font-semibold text-slate-100">Infos</h2>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-2xl bg-slate-950/40 p-3 ring-1 ring-white/10">
                    <dt className="text-xs text-slate-400">Guild ID</dt>
                    <dd className="mt-1 font-mono text-xs text-slate-100">{guild?.id ?? id}</dd>
                  </div>
                  <div className="rounded-2xl bg-slate-950/40 p-3 ring-1 ring-white/10">
                    <dt className="text-xs text-slate-400">Bot</dt>
                    <dd className="mt-1 text-xs text-slate-100">{data?.botInGuild ? "Présent" : "Absent"}</dd>
                  </div>
                  <div className="rounded-2xl bg-slate-950/40 p-3 ring-1 ring-white/10">
                    <dt className="text-xs text-slate-400">Owner ID</dt>
                    <dd className="mt-1 font-mono text-xs text-slate-100">{guild?.owner_id ?? "—"}</dd>
                  </div>
                  <div className="rounded-2xl bg-slate-950/40 p-3 ring-1 ring-white/10">
                    <dt className="text-xs text-slate-400">Membres (approx.)</dt>
                    <dd className="mt-1 text-xs text-slate-100">{guild?.approximate_member_count ?? "—"}</dd>
                  </div>
                </dl>

                {!data?.botInGuild && (
                  <div className="mt-4 rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-100">
                    <p className="font-semibold">Le bot n’est pas sur ce serveur</p>
                    <p className="mt-1 text-rose-100/80">
                      Ajoute le bot au serveur, puis recharge cette page.
                    </p>
                  </div>
                )}
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
                <h2 className="text-sm font-semibold text-slate-100">Actions</h2>
                <p className="mt-2 text-sm text-slate-300">
                  Ici on pourra mettre la config du bot (channels, logs, prefix, etc.).
                </p>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => window.location.reload()}
                    className="rounded-xl bg-indigo-600 px-3 py-2 text-xs font-semibold text-white shadow-lg shadow-indigo-600/20 transition hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-300/60"
                  >
                    Rafraîchir
                  </button>
                  <Link
                    to="/dashboard"
                    className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-100 transition hover:bg-white/10"
                  >
                    Retour liste
                  </Link>
                </div>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  )
}

