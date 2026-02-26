import { useEffect, useMemo, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { apiFetch } from "../lib/api"
import { getJwt } from "../lib/auth"

function prettyJson(value) {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value ?? "")
  }
}

function stringIdFromDoc(d) {
  if (!d) return ""
  // Mongo driver sérialise ObjectId via toJSON => string en général.
  if (d._id !== undefined && d._id !== null) return String(d._id)
  return ""
}

function toInputDateTimeLocal(value) {
  if (!value) return ""
  try {
    const d = new Date(value)
    const pad = n => String(n).padStart(2, "0")
    const yyyy = d.getFullYear()
    const mm = pad(d.getMonth() + 1)
    const dd = pad(d.getDate())
    const hh = pad(d.getHours())
    const mi = pad(d.getMinutes())
    return `${yyyy}-${mm}-${dd}T${hh}:${mi}`
  } catch {
    return ""
  }
}

function parseStringArray(text) {
  const raw = String(text ?? "")
  if (!raw.trim()) return []
  // accepte: séparé par virgules ou retours ligne
  return raw
    .split(/[,\n]/)
    .map(s => s.trim())
    .filter(Boolean)
}

function guessFormKind(collectionName) {
  const name = String(collectionName || "").toLowerCase()
  if (name === "giveaways") return "giveaways"
  if (name === "level" || name === "levels") return "levels"
  if (name === "users" || name === "user") return "users"
  if (name === "warn" || name === "warns") return "warns"
  if (name === "ticketsettings" || name === "ticketsettings".toLowerCase()) return "ticketsettings"
  if (name === "shopitem" || name === "shopitems") return "shopitems"
  if (name === "guildconfigurations" || name === "guildconfiguration") return "guildconfigurations"
  return "json"
}

export default function DevDb() {
  const navigate = useNavigate()

  const token = useMemo(() => getJwt(), [])

  const [status, setStatus] = useState("loading") // loading|ready|error
  const [error, setError] = useState(null)

  const [collections, setCollections] = useState([])
  const [collection, setCollection] = useState("")

  const [filterJson, setFilterJson] = useState("{}")
  const [limit, setLimit] = useState(20)
  const [skip, setSkip] = useState(0)

  const [docs, setDocs] = useState([])
  const [total, setTotal] = useState(null)

  const [selectedId, setSelectedId] = useState("")
  const [selectedDoc, setSelectedDoc] = useState(null)

  const [editor, setEditor] = useState("")
  const [saving, setSaving] = useState(false)

  const [creating, setCreating] = useState(false)

  const [mode, setMode] = useState("form") // form | json
  const formKind = useMemo(() => guessFormKind(collection), [collection])

  // drafts formulaires (par type)
  const [draftGiveaway, setDraftGiveaway] = useState({
    guildId: "",
    channelId: "",
    endTime: "",
    prize: "",
    winnersCount: 1,
    participantsText: "",
    isEnded: false
  })

  const [draftLevel, setDraftLevel] = useState({ userId: "", guildId: "", xp: 0, level: 0 })
  const [draftUser, setDraftUser] = useState({ userId: "", guildId: "", balance: 0, lastDaily: "", itemsText: "" })
  const [draftWarn, setDraftWarn] = useState({ userId: "", guildId: "", warn: 0, unwarn: 0, raisonText: "" })
  const [draftTicket, setDraftTicket] = useState({
    guildId: "",
    supportRoleId: "",
    ticketCategoryId: "",
    logChannelId: "",
    ticketTypesText: ""
  })
  const [draftShopItem, setDraftShopItem] = useState({
    guildId: "",
    itemId: "",
    name: "",
    description: "",
    price: 0,
    stock: -1,
    type: "role"
  })
  const [draftGuildConfig, setDraftGuildConfig] = useState({
    guildId: "",
    welcomeChannel: "",
    leaveChannel: "",
    autoRole: "",
    antispam: false,
    antilink: false,
    modLogChannel: "",
    antiBadWords: false,
    badWordsText: "",
    autoSanction: false,
    antiRaid: false,
    language: "fr",
    vocChannelId: ""
  })

  useEffect(() => {
    if (!token) {
      navigate("/login", { replace: true })
      return
    }

    let cancelled = false

    async function loadCollections() {
      setStatus("loading")
      setError(null)
      try {
        const payload = await apiFetch("/api/dev-db/collections")
        if (cancelled) return

        const cols = Array.isArray(payload?.collections) ? payload.collections : []
        setCollections(cols)
        setCollection(cols[0] || "")
        setStatus("ready")
      } catch (e) {
        if (cancelled) return
        setError(e?.message || "Erreur inconnue")
        setStatus("error")
      }
    }

    loadCollections()
    return () => {
      cancelled = true
    }
  }, [navigate, token])

  async function loadDocuments(next = {}) {
    const col = next.collection ?? collection
    if (!col) return

    setError(null)

    let parsedFilter = {}
    try {
      parsedFilter = (next.filterJson ?? filterJson).trim()
        ? JSON.parse((next.filterJson ?? filterJson).trim())
        : {}
    } catch {
      setError("Filtre JSON invalide")
      return
    }

    const params = new URLSearchParams()
    params.set("limit", String(next.limit ?? limit))
    params.set("skip", String(next.skip ?? skip))
    params.set("filter", JSON.stringify(parsedFilter))

    try {
      const payload = await apiFetch(`/api/dev-db/${encodeURIComponent(col)}/documents?${params.toString()}`)
      const items = Array.isArray(payload?.documents) ? payload.documents : []
      setDocs(items)
      setTotal(typeof payload?.total === "number" ? payload.total : null)
      setSelectedId("")
      setSelectedDoc(null)
      setEditor("")
    } catch (e) {
      if (e?.status === 401) {
        navigate("/login", { replace: true })
        return
      }
      setError(e?.message || "Erreur inconnue")
    }
  }

  function setEditorFromSelected(doc) {
    setEditor(prettyJson(doc ?? null))
  }

  function resetDraftsForNew() {
    // on garde collection/mode, on reset juste les drafts
    setDraftGiveaway({
      guildId: "",
      channelId: "",
      endTime: "",
      prize: "",
      winnersCount: 1,
      participantsText: "",
      isEnded: false
    })
    setDraftLevel({ userId: "", guildId: "", xp: 0, level: 0 })
    setDraftUser({ userId: "", guildId: "", balance: 0, lastDaily: "", itemsText: "" })
    setDraftWarn({ userId: "", guildId: "", warn: 0, unwarn: 0, raisonText: "" })
    setDraftTicket({
      guildId: "",
      supportRoleId: "",
      ticketCategoryId: "",
      logChannelId: "",
      ticketTypesText: ""
    })
    setDraftShopItem({ guildId: "", itemId: "", name: "", description: "", price: 0, stock: -1, type: "role" })
    setDraftGuildConfig({
      guildId: "",
      welcomeChannel: "",
      leaveChannel: "",
      autoRole: "",
      antispam: false,
      antilink: false,
      modLogChannel: "",
      antiBadWords: false,
      badWordsText: "",
      autoSanction: false,
      antiRaid: false,
      language: "fr",
      vocChannelId: ""
    })
  }

  function loadDraftsFromDoc(doc) {
    if (!doc || typeof doc !== "object") return

    const kind = guessFormKind(collection)
    if (kind === "giveaways") {
      setDraftGiveaway({
        guildId: String(doc.guildId ?? ""),
        channelId: String(doc.channelId ?? ""),
        endTime: toInputDateTimeLocal(doc.endTime),
        prize: String(doc.prize ?? ""),
        winnersCount: Number(doc.winnersCount ?? 1),
        participantsText: Array.isArray(doc.participants) ? doc.participants.join("\n") : "",
        isEnded: Boolean(doc.isEnded)
      })
    } else if (kind === "levels") {
      setDraftLevel({
        userId: String(doc.userId ?? ""),
        guildId: String(doc.guildId ?? ""),
        xp: Number(doc.xp ?? 0),
        level: Number(doc.level ?? 0)
      })
    } else if (kind === "users") {
      setDraftUser({
        userId: String(doc.userId ?? ""),
        guildId: String(doc.guildId ?? ""),
        balance: Number(doc.balance ?? 0),
        lastDaily: toInputDateTimeLocal(doc.lastDaily),
        itemsText: Array.isArray(doc.items) ? doc.items.join("\n") : ""
      })
    } else if (kind === "warns") {
      setDraftWarn({
        userId: String(doc.userId ?? ""),
        guildId: String(doc.guildId ?? ""),
        warn: Number(doc.warn ?? 0),
        unwarn: Number(doc.unwarn ?? 0),
        raisonText: Array.isArray(doc.raison) ? doc.raison.join("\n") : ""
      })
    } else if (kind === "ticketsettings") {
      setDraftTicket({
        guildId: String(doc.guildId ?? ""),
        supportRoleId: String(doc.supportRoleId ?? ""),
        ticketCategoryId: String(doc.ticketCategoryId ?? ""),
        logChannelId: String(doc.logChannelId ?? ""),
        ticketTypesText: Array.isArray(doc.ticketTypes) ? doc.ticketTypes.join("\n") : ""
      })
    } else if (kind === "shopitems") {
      setDraftShopItem({
        guildId: String(doc.guildId ?? ""),
        itemId: String(doc.itemId ?? ""),
        name: String(doc.name ?? ""),
        description: String(doc.description ?? ""),
        price: Number(doc.price ?? 0),
        stock: Number(doc.stock ?? -1),
        type: String(doc.type ?? "role")
      })
    } else if (kind === "guildconfigurations") {
      setDraftGuildConfig({
        guildId: String(doc.guildId ?? ""),
        welcomeChannel: String(doc.welcomeChannel ?? ""),
        leaveChannel: String(doc.leaveChannel ?? ""),
        autoRole: String(doc.autoRole ?? ""),
        antispam: Boolean(doc.antispam),
        antilink: Boolean(doc.antilink),
        modLogChannel: String(doc.modLogChannel ?? ""),
        antiBadWords: Boolean(doc.antiBadWords),
        badWordsText: Array.isArray(doc.badWords) ? doc.badWords.join("\n") : "",
        autoSanction: Boolean(doc.autoSanction),
        antiRaid: Boolean(doc.antiRaid),
        language: String(doc.language ?? "fr"),
        vocChannelId: String(doc.vocChannelId ?? "")
      })
    }
  }

  function buildDocFromDraft() {
    const kind = guessFormKind(collection)

    if (kind === "giveaways") {
      return {
        guildId: draftGiveaway.guildId.trim(),
        channelId: draftGiveaway.channelId.trim(),
        endTime: draftGiveaway.endTime ? new Date(draftGiveaway.endTime) : null,
        prize: draftGiveaway.prize,
        winnersCount: Number(draftGiveaway.winnersCount || 1),
        participants: parseStringArray(draftGiveaway.participantsText),
        isEnded: Boolean(draftGiveaway.isEnded)
      }
    }

    if (kind === "levels") {
      return {
        userId: draftLevel.userId.trim(),
        guildId: draftLevel.guildId.trim(),
        xp: Number(draftLevel.xp || 0),
        level: Number(draftLevel.level || 0)
      }
    }

    if (kind === "users") {
      return {
        userId: draftUser.userId.trim(),
        guildId: draftUser.guildId.trim(),
        balance: Number(draftUser.balance || 0),
        lastDaily: draftUser.lastDaily ? new Date(draftUser.lastDaily) : null,
        items: parseStringArray(draftUser.itemsText)
      }
    }

    if (kind === "warns") {
      return {
        userId: draftWarn.userId.trim(),
        guildId: draftWarn.guildId.trim(),
        warn: Number(draftWarn.warn || 0),
        unwarn: Number(draftWarn.unwarn || 0),
        raison: parseStringArray(draftWarn.raisonText)
      }
    }

    if (kind === "ticketsettings") {
      return {
        guildId: draftTicket.guildId.trim(),
        supportRoleId: draftTicket.supportRoleId.trim(),
        ticketCategoryId: draftTicket.ticketCategoryId.trim(),
        logChannelId: draftTicket.logChannelId.trim(),
        ticketTypes: parseStringArray(draftTicket.ticketTypesText)
      }
    }

    if (kind === "shopitems") {
      return {
        guildId: draftShopItem.guildId.trim(),
        itemId: draftShopItem.itemId.trim(),
        name: draftShopItem.name,
        description: draftShopItem.description,
        price: Number(draftShopItem.price || 0),
        stock: Number(draftShopItem.stock ?? -1),
        type: draftShopItem.type
      }
    }

    if (kind === "guildconfigurations") {
      return {
        guildId: draftGuildConfig.guildId.trim(),
        welcomeChannel: draftGuildConfig.welcomeChannel || null,
        leaveChannel: draftGuildConfig.leaveChannel || null,
        autoRole: draftGuildConfig.autoRole || null,
        antispam: Boolean(draftGuildConfig.antispam),
        antilink: Boolean(draftGuildConfig.antilink),
        modLogChannel: draftGuildConfig.modLogChannel || null,
        antiBadWords: Boolean(draftGuildConfig.antiBadWords),
        badWords: parseStringArray(draftGuildConfig.badWordsText),
        autoSanction: Boolean(draftGuildConfig.autoSanction),
        antiRaid: Boolean(draftGuildConfig.antiRaid),
        language: draftGuildConfig.language || "fr",
        vocChannelId: draftGuildConfig.vocChannelId || null
      }
    }

    return null
  }


  async function loadOne(id) {
    if (!collection || !id) return

    setError(null)
    try {
      const payload = await apiFetch(`/api/dev-db/${encodeURIComponent(collection)}/documents/${encodeURIComponent(id)}`)
      setSelectedId(id)
      setSelectedDoc(payload?.document ?? null)
      setEditorFromSelected(payload?.document ?? null)
      loadDraftsFromDoc(payload?.document ?? null)
    } catch (e) {
      if (e?.status === 401) {
        navigate("/login", { replace: true })
        return
      }
      setError(e?.message || "Erreur inconnue")
    }
  }

  async function createNew() {
    if (!collection) return

    setCreating(true)
    setError(null)
    try {
      let docToCreate

      if (mode === "form" && formKind !== "json") {
        docToCreate = buildDocFromDraft()
      } else {
        let parsed
        try {
          parsed = editor.trim() ? JSON.parse(editor) : {}
        } catch {
          setError("JSON invalide")
          return
        }
        docToCreate = parsed
      }

      // Nettoyage: enlever les nulls de dates si non renseignées
      if (docToCreate && docToCreate.endTime === null) delete docToCreate.endTime
      if (docToCreate && docToCreate.lastDaily === null) delete docToCreate.lastDaily

      const payload = await apiFetch(`/api/dev-db/${encodeURIComponent(collection)}/documents`, {
        method: "POST",
        body: docToCreate
      })

      const doc = payload?.document ?? null
      const newId = doc ? stringIdFromDoc(doc) : ""

      await loadDocuments({ skip: 0 })

      if (newId) {
        setSelectedId(newId)
        setSelectedDoc(doc)
        setEditorFromSelected(doc)
        loadDraftsFromDoc(doc)
      }
    } catch (e) {
      if (e?.status === 401) {
        navigate("/login", { replace: true })
        return
      }
      setError(e?.message || "Erreur inconnue")
    } finally {
      setCreating(false)
    }
  }

  async function save() {
    if (!collection || !selectedId) return

    setSaving(true)
    setError(null)
    try {
      let patch

      if (mode === "form" && formKind !== "json") {
        patch = buildDocFromDraft()
      } else {
        let parsed
        try {
          parsed = editor.trim() ? JSON.parse(editor) : {}
        } catch {
          setError("JSON invalide")
          return
        }
        patch = parsed
      }

      if (patch && patch.endTime === null) delete patch.endTime
      if (patch && patch.lastDaily === null) delete patch.lastDaily

      const payload = await apiFetch(`/api/dev-db/${encodeURIComponent(collection)}/documents/${encodeURIComponent(selectedId)}`, {
        method: "PATCH",
        body: patch
      })

      const doc = payload?.document ?? null
      setSelectedDoc(doc)
      setEditorFromSelected(doc)
      loadDraftsFromDoc(doc)

      await loadDocuments()
    } catch (e) {
      if (e?.status === 401) {
        navigate("/login", { replace: true })
        return
      }
      setError(e?.message || "Erreur inconnue")
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!collection || !selectedId) return

    const ok = window.confirm("Supprimer ce document ?")
    if (!ok) return

    setSaving(true)
    setError(null)
    try {
      await apiFetch(`/api/dev-db/${encodeURIComponent(collection)}/documents/${encodeURIComponent(selectedId)}`, {
        method: "DELETE"
      })

      setSelectedId("")
      setSelectedDoc(null)
      setEditor("")

      await loadDocuments()
    } catch (e) {
      if (e?.status === 401) {
        navigate("/login", { replace: true })
        return
      }
      setError(e?.message || "Erreur inconnue")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-slate-100">
      <header className="border-b border-white/10 bg-slate-950/40 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4">
          <div className="flex items-center gap-3">
            <Link
              to="/dashboard"
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-100 transition hover:bg-white/10"
            >
               Dashboard
            </Link>
            <div>
              <p className="text-sm font-semibold leading-tight">DB Dev</p>
              <p className="text-xs text-slate-400">Admin collections autorisées</p>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-4 py-8 lg:grid-cols-3">
        <section className="rounded-3xl border border-white/10 bg-white/5 p-5 lg:col-span-1">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Collections</h2>
            <button
              type="button"
              onClick={() => loadDocuments()}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-100 transition hover:bg-white/10"
              disabled={!collection}
            >
              Rafraîchir
            </button>
          </div>

          {status === "loading" ? <p className="mt-3 text-xs text-slate-400">Chargement…</p> : null}

          {status === "error" ? (
            <p className="mt-3 text-xs text-rose-200">{error}</p>
          ) : (
            <div className="mt-4 space-y-3">
              <label className="block text-xs text-slate-400">
                Collection
                <select
                  value={collection}
                  onChange={e => {
                    const next = e.target.value
                    setCollection(next)
                    setDocs([])
                    setTotal(null)
                    setSelectedId("")
                    setSelectedDoc(null)
                    setEditor("")
                    if (next) loadDocuments({ collection: next, skip: 0 })
                  }}
                  className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-slate-100"
                >
                  {collections.map(c => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-xs text-slate-400">
                Filtre Mongo (JSON sans opérateurs $)
                <textarea
                  value={filterJson}
                  onChange={e => setFilterJson(e.target.value)}
                  spellCheck={false}
                  className="mt-2 h-[90px] w-full rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 font-mono text-[11px] text-slate-100"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs text-slate-400">
                  Limit
                  <input
                    type="number"
                    value={limit}
                    min={1}
                    max={50}
                    onChange={e => setLimit(Number(e.target.value || 20))}
                    className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-slate-100"
                  />
                </label>
                <label className="block text-xs text-slate-400">
                  Skip
                  <input
                    type="number"
                    value={skip}
                    min={0}
                    max={100000}
                    onChange={e => setSkip(Number(e.target.value || 0))}
                    className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-slate-100"
                  />
                </label>
              </div>

              <button
                type="button"
                onClick={() => loadDocuments()}
                className="w-full rounded-xl bg-indigo-600/80 px-3 py-2 text-xs font-semibold text-white transition hover:bg-indigo-600"
                disabled={!collection}
              >
                Charger documents
              </button>

              {typeof total === "number" ? (
                <p className="text-xs text-slate-400">
                  Total: <span className="text-slate-200">{total}</span>
                </p>
              ) : null}

              {error ? <p className="text-xs text-rose-200">{error}</p> : null}

              <div className="mt-2 max-h-[420px] space-y-2 overflow-auto pr-1">
                {docs.map(d => {
                  const id = stringIdFromDoc(d)
                  const label = id ? `_id: ${id}` : "(doc sans _id exploitable)"

                  return (
                    <button
                      key={id || JSON.stringify(d)}
                      type="button"
                      onClick={() => (id ? loadOne(id) : null)}
                      className={`w-full rounded-2xl border px-3 py-2 text-left text-xs ring-1 transition ${
                        selectedId && selectedId === id
                          ? "border-indigo-400/30 bg-indigo-600/15 ring-indigo-400/30"
                          : "border-white/10 bg-slate-950/40 ring-white/10 hover:bg-slate-950/55"
                      }`}
                      disabled={!id}
                    >
                      <div className="font-semibold text-slate-100">{label}</div>
                      <div className="mt-1 truncate text-[11px] text-slate-400">
                        {Object.keys(d || {})
                          .slice(0, 6)
                          .join(", ")}
                      </div>
                    </button>
                  )
                })}

                {!docs.length ? <p className="text-xs text-slate-400">Aucun document chargé.</p> : null}
              </div>
            </div>
          )}
        </section>

        <section className="rounded-3xl border border-white/10 bg-white/5 p-5 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">Édition</h2>

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-slate-950/40 p-1">
                <button
                  type="button"
                  onClick={() => setMode("form")}
                  className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
                    mode === "form" ? "bg-indigo-600/40 text-indigo-100" : "text-slate-200 hover:bg-white/5"
                  }`}
                >
                  Formulaire
                </button>
                <button
                  type="button"
                  onClick={() => setMode("json")}
                  className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
                    mode === "json" ? "bg-indigo-600/40 text-indigo-100" : "text-slate-200 hover:bg-white/5"
                  }`}
                >
                  JSON
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  setSelectedId("")
                  setSelectedDoc(null)
                  resetDraftsForNew()
                  setEditor("{}")
                }}
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-100 transition hover:bg-white/10"
              >
                Nouveau
              </button>

              <button
                type="button"
                onClick={createNew}
                disabled={!collection || creating}
                className={`rounded-xl px-3 py-2 text-xs font-semibold text-white transition ${
                  !collection || creating ? "bg-white/10 text-slate-400" : "bg-indigo-600/80 hover:bg-indigo-600"
                }`}
              >
                {creating ? "Création…" : "Créer (POST)"}
              </button>

              <button
                type="button"
                onClick={save}
                disabled={!selectedId || saving}
                className={`rounded-xl px-3 py-2 text-xs font-semibold text-white transition ${
                  !selectedId || saving
                    ? "bg-white/10 text-slate-400"
                    : "bg-emerald-600/80 hover:bg-emerald-600"
                }`}
              >
                {saving ? "Sauvegarde…" : "Sauvegarder (PATCH)"}
              </button>

              <button
                type="button"
                onClick={remove}
                disabled={!selectedId || saving}
                className={`rounded-xl px-3 py-2 text-xs font-semibold text-white transition ${
                  !selectedId || saving ? "bg-white/10 text-slate-400" : "bg-rose-600/80 hover:bg-rose-600"
                }`}
              >
                Supprimer
              </button>
            </div>
          </div>

          {error ? <p className="mt-3 text-xs text-rose-200">{error}</p> : null}

          {mode === "form" && formKind === "json" ? (
            <p className="mt-4 text-sm text-slate-400">
              Pas de formulaire dédié pour cette collection. Utilise le mode JSON.
            </p>
          ) : null}

          {mode === "form" && formKind !== "json" ? (
            <div className="mt-4 space-y-4">
              {formKind === "giveaways" ? (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <label className="text-xs text-slate-400">
                    guildId
                    <input
                      value={draftGiveaway.guildId}
                      onChange={e => setDraftGiveaway(s => ({ ...s, guildId: e.target.value }))}
                      className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-slate-100"
                    />
                  </label>
                  <label className="text-xs text-slate-400">
                    channelId
                    <input
                      value={draftGiveaway.channelId}
                      onChange={e => setDraftGiveaway(s => ({ ...s, channelId: e.target.value }))}
                      className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-slate-100"
                    />
                  </label>
                  <label className="text-xs text-slate-400 md:col-span-2">
                    endTime
                    <input
                      type="datetime-local"
                      value={draftGiveaway.endTime}
                      onChange={e => setDraftGiveaway(s => ({ ...s, endTime: e.target.value }))}
                      className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-slate-100"
                    />
                  </label>
                  <label className="text-xs text-slate-400 md:col-span-2">
                    prize
                    <input
                      value={draftGiveaway.prize}
                      onChange={e => setDraftGiveaway(s => ({ ...s, prize: e.target.value }))}
                      className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-slate-100"
                    />
                  </label>
                  <label className="text-xs text-slate-400">
                    winnersCount
                    <input
                      type="number"
                      min={1}
                      value={draftGiveaway.winnersCount}
                      onChange={e => setDraftGiveaway(s => ({ ...s, winnersCount: Number(e.target.value || 1) }))}
                      className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-slate-100"
                    />
                  </label>
                  <label className="flex items-center gap-2 text-xs text-slate-200">
                    <input
                      type="checkbox"
                      checked={draftGiveaway.isEnded}
                      onChange={e => setDraftGiveaway(s => ({ ...s, isEnded: e.target.checked }))}
                    />
                    isEnded
                  </label>
                  <label className="text-xs text-slate-400 md:col-span-2">
                    participants (1 userId par ligne)
                    <textarea
                      value={draftGiveaway.participantsText}
                      onChange={e => setDraftGiveaway(s => ({ ...s, participantsText: e.target.value }))}
                      className="mt-2 h-[120px] w-full rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 font-mono text-[11px] text-slate-100"
                      spellCheck={false}
                    />
                  </label>
                </div>
              ) : null}

              {formKind === "levels" ? (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <label className="text-xs text-slate-400">
                    userId
                    <input
                      value={draftLevel.userId}
                      onChange={e => setDraftLevel(s => ({ ...s, userId: e.target.value }))}
                      className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-slate-100"
                    />
                  </label>
                  <label className="text-xs text-slate-400">
                    guildId
                    <input
                      value={draftLevel.guildId}
                      onChange={e => setDraftLevel(s => ({ ...s, guildId: e.target.value }))}
                      className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-slate-100"
                    />
                  </label>
                  <label className="text-xs text-slate-400">
                    xp
                    <input
                      type="number"
                      value={draftLevel.xp}
                      onChange={e => setDraftLevel(s => ({ ...s, xp: Number(e.target.value || 0) }))}
                      className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-slate-100"
                    />
                  </label>
                  <label className="text-xs text-slate-400">
                    level
                    <input
                      type="number"
                      value={draftLevel.level}
                      onChange={e => setDraftLevel(s => ({ ...s, level: Number(e.target.value || 0) }))}
                      className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-slate-100"
                    />
                  </label>
                </div>
              ) : null}

              {formKind === "users" ? (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <label className="text-xs text-slate-400">
                    userId
                    <input
                      value={draftUser.userId}
                      onChange={e => setDraftUser(s => ({ ...s, userId: e.target.value }))}
                      className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-slate-100"
                    />
                  </label>
                  <label className="text-xs text-slate-400">
                    guildId
                    <input
                      value={draftUser.guildId}
                      onChange={e => setDraftUser(s => ({ ...s, guildId: e.target.value }))}
                      className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-slate-100"
                    />
                  </label>
                  <label className="text-xs text-slate-400">
                    balance
                    <input
                      type="number"
                      value={draftUser.balance}
                      onChange={e => setDraftUser(s => ({ ...s, balance: Number(e.target.value || 0) }))}
                      className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-slate-100"
                    />
                  </label>
                  <label className="text-xs text-slate-400">
                    lastDaily
                    <input
                      type="datetime-local"
                      value={draftUser.lastDaily}
                      onChange={e => setDraftUser(s => ({ ...s, lastDaily: e.target.value }))}
                      className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-slate-100"
                    />
                  </label>
                  <label className="text-xs text-slate-400 md:col-span-2">
                    items (1 par ligne)
                    <textarea
                      value={draftUser.itemsText}
                      onChange={e => setDraftUser(s => ({ ...s, itemsText: e.target.value }))}
                      className="mt-2 h-[120px] w-full rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 font-mono text-[11px] text-slate-100"
                      spellCheck={false}
                    />
                  </label>
                </div>
              ) : null}

              {formKind === "warns" ? (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <label className="text-xs text-slate-400">
                    userId
                    <input
                      value={draftWarn.userId}
                      onChange={e => setDraftWarn(s => ({ ...s, userId: e.target.value }))}
                      className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-slate-100"
                    />
                  </label>
                  <label className="text-xs text-slate-400">
                    guildId
                    <input
                      value={draftWarn.guildId}
                      onChange={e => setDraftWarn(s => ({ ...s, guildId: e.target.value }))}
                      className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-slate-100"
                    />
                  </label>
                  <label className="text-xs text-slate-400">
                    warn
                    <input
                      type="number"
                      value={draftWarn.warn}
                      onChange={e => setDraftWarn(s => ({ ...s, warn: Number(e.target.value || 0) }))}
                      className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-slate-100"
                    />
                  </label>
                  <label className="text-xs text-slate-400">
                    unwarn
                    <input
                      type="number"
                      value={draftWarn.unwarn}
                      onChange={e => setDraftWarn(s => ({ ...s, unwarn: Number(e.target.value || 0) }))}
                      className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-slate-100"
                    />
                  </label>
                  <label className="text-xs text-slate-400 md:col-span-2">
                    raison (1 par ligne)
                    <textarea
                      value={draftWarn.raisonText}
                      onChange={e => setDraftWarn(s => ({ ...s, raisonText: e.target.value }))}
                      className="mt-2 h-[120px] w-full rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 font-mono text-[11px] text-slate-100"
                      spellCheck={false}
                    />
                  </label>
                </div>
              ) : null}

              {formKind === "ticketsettings" ? (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <label className="text-xs text-slate-400">
                    guildId
                    <input
                      value={draftTicket.guildId}
                      onChange={e => setDraftTicket(s => ({ ...s, guildId: e.target.value }))}
                      className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-slate-100"
                    />
                  </label>
                  <label className="text-xs text-slate-400">
                    supportRoleId
                    <input
                      value={draftTicket.supportRoleId}
                      onChange={e => setDraftTicket(s => ({ ...s, supportRoleId: e.target.value }))}
                      className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-slate-100"
                    />
                  </label>
                  <label className="text-xs text-slate-400">
                    ticketCategoryId
                    <input
                      value={draftTicket.ticketCategoryId}
                      onChange={e => setDraftTicket(s => ({ ...s, ticketCategoryId: e.target.value }))}
                      className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-slate-100"
                    />
                  </label>
                  <label className="text-xs text-slate-400">
                    logChannelId
                    <input
                      value={draftTicket.logChannelId}
                      onChange={e => setDraftTicket(s => ({ ...s, logChannelId: e.target.value }))}
                      className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-slate-100"
                    />
                  </label>
                  <label className="text-xs text-slate-400 md:col-span-2">
                    ticketTypes (1 par ligne)
                    <textarea
                      value={draftTicket.ticketTypesText}
                      onChange={e => setDraftTicket(s => ({ ...s, ticketTypesText: e.target.value }))}
                      className="mt-2 h-[120px] w-full rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 font-mono text-[11px] text-slate-100"
                      spellCheck={false}
                    />
                  </label>
                </div>
              ) : null}

              {formKind === "shopitems" ? (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <label className="text-xs text-slate-400">
                    guildId
                    <input
                      value={draftShopItem.guildId}
                      onChange={e => setDraftShopItem(s => ({ ...s, guildId: e.target.value }))}
                      className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-slate-100"
                    />
                  </label>
                  <label className="text-xs text-slate-400">
                    itemId
                    <input
                      value={draftShopItem.itemId}
                      onChange={e => setDraftShopItem(s => ({ ...s, itemId: e.target.value }))}
                      className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-slate-100"
                    />
                  </label>
                  <label className="text-xs text-slate-400 md:col-span-2">
                    name
                    <input
                      value={draftShopItem.name}
                      onChange={e => setDraftShopItem(s => ({ ...s, name: e.target.value }))}
                      className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-slate-100"
                    />
                  </label>
                  <label className="text-xs text-slate-400 md:col-span-2">
                    description
                    <textarea
                      value={draftShopItem.description}
                      onChange={e => setDraftShopItem(s => ({ ...s, description: e.target.value }))}
                      className="mt-2 h-[100px] w-full rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-slate-100"
                      spellCheck={false}
                    />
                  </label>
                  <label className="text-xs text-slate-400">
                    price
                    <input
                      type="number"
                      value={draftShopItem.price}
                      onChange={e => setDraftShopItem(s => ({ ...s, price: Number(e.target.value || 0) }))}
                      className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-slate-100"
                    />
                  </label>
                  <label className="text-xs text-slate-400">
                    stock (-1 illimité)
                    <input
                      type="number"
                      value={draftShopItem.stock}
                      onChange={e => setDraftShopItem(s => ({ ...s, stock: Number(e.target.value || -1) }))}
                      className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-slate-100"
                    />
                  </label>
                  <label className="text-xs text-slate-400">
                    type
                    <select
                      value={draftShopItem.type}
                      onChange={e => setDraftShopItem(s => ({ ...s, type: e.target.value }))}
                      className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-slate-100"
                    >
                      <option value="role">role</option>
                      <option value="item">item</option>
                      <option value="other">other</option>
                    </select>
                  </label>
                </div>
              ) : null}

              {formKind === "guildconfigurations" ? (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <label className="text-xs text-slate-400 md:col-span-2">
                    guildId
                    <input
                      value={draftGuildConfig.guildId}
                      onChange={e => setDraftGuildConfig(s => ({ ...s, guildId: e.target.value }))}
                      className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-slate-100"
                    />
                  </label>

                  <label className="text-xs text-slate-400">
                    welcomeChannel
                    <input
                      value={draftGuildConfig.welcomeChannel}
                      onChange={e => setDraftGuildConfig(s => ({ ...s, welcomeChannel: e.target.value }))}
                      className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-slate-100"
                    />
                  </label>
                  <label className="text-xs text-slate-400">
                    leaveChannel
                    <input
                      value={draftGuildConfig.leaveChannel}
                      onChange={e => setDraftGuildConfig(s => ({ ...s, leaveChannel: e.target.value }))}
                      className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-slate-100"
                    />
                  </label>

                  <label className="text-xs text-slate-400">
                    autoRole
                    <input
                      value={draftGuildConfig.autoRole}
                      onChange={e => setDraftGuildConfig(s => ({ ...s, autoRole: e.target.value }))}
                      className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-slate-100"
                    />
                  </label>
                  <label className="text-xs text-slate-400">
                    modLogChannel
                    <input
                      value={draftGuildConfig.modLogChannel}
                      onChange={e => setDraftGuildConfig(s => ({ ...s, modLogChannel: e.target.value }))}
                      className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-slate-100"
                    />
                  </label>

                  <label className="flex items-center gap-2 text-xs text-slate-200">
                    <input
                      type="checkbox"
                      checked={draftGuildConfig.antispam}
                      onChange={e => setDraftGuildConfig(s => ({ ...s, antispam: e.target.checked }))}
                    />
                    antispam
                  </label>
                  <label className="flex items-center gap-2 text-xs text-slate-200">
                    <input
                      type="checkbox"
                      checked={draftGuildConfig.antilink}
                      onChange={e => setDraftGuildConfig(s => ({ ...s, antilink: e.target.checked }))}
                    />
                    antilink
                  </label>
                  <label className="flex items-center gap-2 text-xs text-slate-200">
                    <input
                      type="checkbox"
                      checked={draftGuildConfig.antiBadWords}
                      onChange={e => setDraftGuildConfig(s => ({ ...s, antiBadWords: e.target.checked }))}
                    />
                    antiBadWords
                  </label>
                  <label className="flex items-center gap-2 text-xs text-slate-200">
                    <input
                      type="checkbox"
                      checked={draftGuildConfig.autoSanction}
                      onChange={e => setDraftGuildConfig(s => ({ ...s, autoSanction: e.target.checked }))}
                    />
                    autoSanction
                  </label>
                  <label className="flex items-center gap-2 text-xs text-slate-200">
                    <input
                      type="checkbox"
                      checked={draftGuildConfig.antiRaid}
                      onChange={e => setDraftGuildConfig(s => ({ ...s, antiRaid: e.target.checked }))}
                    />
                    antiRaid
                  </label>

                  <label className="text-xs text-slate-400 md:col-span-2">
                    badWords (1 par ligne)
                    <textarea
                      value={draftGuildConfig.badWordsText}
                      onChange={e => setDraftGuildConfig(s => ({ ...s, badWordsText: e.target.value }))}
                      className="mt-2 h-[120px] w-full rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 font-mono text-[11px] text-slate-100"
                      spellCheck={false}
                    />
                  </label>

                  <label className="text-xs text-slate-400">
                    language
                    <select
                      value={draftGuildConfig.language}
                      onChange={e => setDraftGuildConfig(s => ({ ...s, language: e.target.value }))}
                      className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-slate-100"
                    >
                      <option value="fr">fr</option>
                      <option value="en">en</option>
                    </select>
                  </label>
                  <label className="text-xs text-slate-400">
                    vocChannelId
                    <input
                      value={draftGuildConfig.vocChannelId}
                      onChange={e => setDraftGuildConfig(s => ({ ...s, vocChannelId: e.target.value }))}
                      className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-slate-100"
                    />
                  </label>
                </div>
              ) : null}
            </div>
          ) : null}

          {mode === "json" ? (
            <div className="mt-4 space-y-3">
              {!selectedId ? null : (
                <p className="text-xs text-slate-400">
                  Document _id: <span className="font-mono text-slate-200">{selectedId}</span>
                </p>
              )}

              <textarea
                value={editor}
                onChange={e => setEditor(e.target.value)}
                className="h-[520px] w-full rounded-2xl border border-white/10 bg-slate-950/50 p-3 font-mono text-xs text-slate-100 outline-none focus:ring-2 focus:ring-indigo-300/60"
                spellCheck={false}
              />

              <details className="rounded-2xl border border-white/10 bg-slate-950/30 p-3">
                <summary className="cursor-pointer text-xs font-semibold text-slate-200">Aperçu (read-only)</summary>
                <pre className="mt-3 overflow-auto text-xs text-slate-100">{prettyJson(selectedDoc)}</pre>
              </details>
            </div>
          ) : null}
        </section>
      </main>
    </div>
  )
}
