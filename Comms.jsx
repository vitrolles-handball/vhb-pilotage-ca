// Étape 6 — Annonces, aide & support, réglages de notifications. Étape 7 — discussions (fils d'équipe, réponses aux annonces).
import React, { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { db, f, RED, YELLOW, BLACK, TEXT, MUT, BORDER, OK } from "./App.jsx";

// Le bouton « retour » du téléphone ferme la page du dessus (au lieu de quitter l'appli).
const PAGES = [];
export function useBackClose(onClose) {
  const ref = React.useRef(onClose); ref.current = onClose;
  const tag = React.useRef("vhbpage" + Math.random().toString(36).slice(2, 8));
  useEffect(() => {
    const me = tag.current; PAGES.push(me);
    try { window.history.pushState({ vhbpage: me }, ""); } catch (e) {}
    const pop = () => { if (PAGES[PAGES.length - 1] === me) { PAGES.pop(); ref.current(); } };
    const key = (e) => { if (e.key === "Escape" && PAGES[PAGES.length - 1] === me) back(); };
    window.addEventListener("popstate", pop); window.addEventListener("keydown", key);
    return () => { window.removeEventListener("popstate", pop); window.removeEventListener("keydown", key); const i = PAGES.indexOf(me); if (i >= 0) PAGES.splice(i, 1); };
  }, []);
  const back = () => {
    try { if (window.history.state && window.history.state.vhbpage === tag.current) { window.history.back(); return; } } catch (e) {}
    const i = PAGES.indexOf(tag.current); if (i >= 0) PAGES.splice(i, 1); ref.current();
  };
  return back;
}
const has = (rights, r) => (rights || []).includes("*") || (rights || []).includes(r);
export const canSend = (rights) => has(rights, "msg") || has(rights, "msgall");
const fmtDT = (iso) => iso ? new Date(iso).toLocaleString("fr-FR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
async function post(url, payload) {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401) { const e = new Error(j.error || "Session expirée"); e.status = 401; throw e; }
  if (!r.ok) { const e = new Error(j.error || "Erreur " + r.status); e.status = r.status; throw e; }
  return j;
}
const Chip = ({ children, bg, fg }) => <span style={{ fontSize: 11.5, fontWeight: 800, padding: "4px 9px", borderRadius: 10, background: bg || "#EEF0F3", color: fg || "#3A3F47", whiteSpace: "nowrap" }}>{children}</span>;

export function Sheet({ title, onClose, children, wide, label }) {
  useEffect(() => { const h = (e) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [onClose]);
  return createPortal(<div role="dialog" aria-modal="true" aria-label={label || title} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} style={{ position: "fixed", inset: 0, background: "rgba(16,17,20,.55)", zIndex: 220, display: "flex", justifyContent: "center", alignItems: "flex-start", overflowY: "auto", padding: "calc(12px + env(safe-area-inset-top)) 12px 40px" }}>
    <div className="card" style={{ position: "relative", width: "100%", maxWidth: wide ? 760 : 560, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ position: "sticky", top: 0, alignSelf: "flex-end", height: 0, zIndex: 3 }}><button aria-label="Fermer" onClick={onClose} style={{ position: "relative", top: -4, right: -6, boxShadow: "0 2px 8px rgba(0,0,0,.12)", width: 40, height: 40, borderRadius: 20, border: "none", background: "#EEF0F3", cursor: "pointer", fontSize: 22, lineHeight: 1 }}><span aria-hidden="true">×</span></button></div>
      <div style={{ fontSize: 19, fontWeight: 800, color: TEXT, paddingRight: 48 }}>{title}</div>
      {children}
    </div>
  </div>, document.body);
}
const Tabs = ({ tabs, cur, onTab }) => <div role="tablist" style={{ display: "flex", gap: 4, background: "#E9EBEF", borderRadius: 30, padding: 4, alignSelf: "flex-start", flexWrap: "wrap" }}>
  {tabs.map(([k, l, n]) => <button key={k} role="tab" aria-selected={cur === k} onClick={() => onTab(k)} style={{ minHeight: 36, padding: "0 14px", border: "none", borderRadius: 30, cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 800, background: cur === k ? BLACK : "transparent", color: cur === k ? "#fff" : "#3A3F47" }}>{l}{n ? <span style={{ marginLeft: 6, background: RED, color: "#fff", borderRadius: 9, padding: "1px 6px", fontSize: 11 }}>{n}</span> : null}</button>)}
</div>;

// =====================================================================================
// Annonces
// =====================================================================================
export function useAnnonces(enabled) {
  const [d, setD] = useState({ received: [], sent: [], fils: [] });
  const load = useCallback(async () => {
    if (!enabled) return;
    const [j, k] = await Promise.all([post("/api/annonces", { action: "list" }).catch(() => null), post("/api/annonces", { action: "fils" }).catch(() => null)]);
    setD((x) => ({
      received: j ? (Array.isArray(j.received) ? j.received : []) : x.received,
      sent: j ? (Array.isArray(j.sent) ? j.sent : []) : x.sent,
      fils: k ? (Array.isArray(k.fils) ? k.fils : []) : x.fils,
    }));
  }, [enabled]);
  useEffect(() => { load(); if (!enabled) return; const t = setInterval(load, 3 * 60 * 1000); const v = () => { if (document.visibilityState === "visible") load(); }; document.addEventListener("visibilitychange", v); return () => { clearInterval(t); document.removeEventListener("visibilitychange", v); }; }, [load, enabled]);
  const unread = d.received.filter((a) => !a.lu || (a.accuse && !a.recu)).length + (d.fils || []).reduce((n, x) => n + (Number(x.unread) || 0), 0);
  return [d, load, unread];
}

export function AnnoncesPanel({ rights, data, reload, focusId, focusFil, onClose }) {
  const sender = canSend(rights);
  const [tab, setTab] = useState(focusFil ? "discussions" : "recues");
  const [open, setOpen] = useState(focusId || null);
  const [fil, setFil] = useState(focusFil || null);
  const fils = data.fils || [];
  const filOf = (id) => fils.find((x) => x.fil === "annonce:" + id);
  const DiscBtn = ({ a }) => { const x = filOf(a.id); return <button className="btn btn-ghost" style={{ alignSelf: "flex-start", minHeight: 40 }} onClick={() => setFil("annonce:" + a.id)}><i className="ti ti-messages" aria-hidden="true" />{x && x.n ? "Discussion · " + x.n + " message(s)" + (x.unread ? " · " + x.unread + " nouveau(x)" : "") : "Répondre"}</button>; };
  const [compose, setCompose] = useState(false);
  const mark = async (a, ack) => { try { await post("/api/annonces", { action: ack ? "ack" : "read", id: a.id }); await reload(); } catch (e) { alert(e.message); } };
  useEffect(() => { const a = data.received.find((x) => x.id === open); if (a && !a.lu) mark(a, false); }, [open]);
  const nUnread = data.received.filter((a) => !a.lu).length;
  const nDisc = fils.reduce((n, x) => n + (Number(x.unread) || 0), 0);
  if (fil) return <Sheet title="Discussion" onClose={onClose} wide label="Discussion"><ThreadView fil={fil} onBack={() => { setFil(null); setTab("discussions"); reload(); }} /></Sheet>;
  return <Sheet title="Annonces & discussions" onClose={onClose} wide>
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      <Tabs tabs={[["recues", "Reçues", nUnread], sender && ["envoyees", "Envoyées"], ["discussions", "Discussions", nDisc]].filter(Boolean)} cur={tab} onTab={setTab} />
      {sender && <button className="btn btn-red" style={{ marginLeft: "auto" }} onClick={() => setCompose(true)}><i className="ti ti-speakerphone" aria-hidden="true" />Nouvelle annonce</button>}
    </div>
    {tab === "recues" && <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {!data.received.length && <div style={{ color: MUT, fontSize: 13.5 }}>Aucune annonce pour l'instant.</div>}
      {data.received.map((a) => { const isOpen = open === a.id; return <div key={a.id} style={{ background: a.lu ? "#F7F8FA" : "#FFF9E6", borderRadius: 14, padding: "12px 14px", borderLeft: "4px solid " + (a.lu ? BORDER : YELLOW) }}>
        <button onClick={() => setOpen(isOpen ? null : a.id)} style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {!a.lu && <span aria-label="non lue" style={{ width: 9, height: 9, borderRadius: 5, background: RED, flex: "0 0 auto" }} />}
            <span style={{ fontWeight: 800, fontSize: 15, flex: 1, color: TEXT }}>{a.titre}</span>
            {a.accuse && (a.recu ? <Chip bg="#E7F4EA" fg="#1F5C30">Bien reçu</Chip> : <Chip bg="#FDECEC" fg="#9E1B1B">À confirmer</Chip>)}
          </div>
          <div style={{ fontSize: 12.5, color: MUT, marginTop: 2 }}>{a.auteur} · {a.cible} · {fmtDT(a.date)}</div>
          {!isOpen && <div style={{ fontSize: 13.5, color: "#3A3F47", marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.texte}</div>}
        </button>
        {isOpen && <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ whiteSpace: "pre-wrap", fontSize: 14.5, lineHeight: 1.55, color: TEXT }}>{a.texte}</div>
          {a.accuse && !a.recu && <button className="btn btn-red" style={{ alignSelf: "flex-start", minHeight: 46 }} onClick={() => mark(a, true)}><i className="ti ti-check" aria-hidden="true" />Bien reçu</button>}
          <DiscBtn a={a} />
        </div>}
      </div>; })}
    </div>}
    {tab === "envoyees" && <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {!data.sent.length && <div style={{ color: MUT, fontSize: 13.5 }}>Tu n'as encore envoyé aucune annonce.</div>}
      {data.sent.map((a) => <details key={a.id} style={{ background: "#F7F8FA", borderRadius: 14, padding: "12px 14px" }}>
        <summary style={{ cursor: "pointer", listStyle: "none" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontWeight: 800, fontSize: 15, flex: 1, color: TEXT }}>{a.titre}</span>
            <Chip bg={a.lus === a.total ? "#E7F4EA" : "#EEF0F3"} fg={a.lus === a.total ? "#1F5C30" : "#3A3F47"}>Lu {a.lus}/{a.total}</Chip>
            {a.accuse && <Chip bg={a.recus === a.total ? "#E7F4EA" : "#FFF6D6"} fg={a.recus === a.total ? "#1F5C30" : "#6B4A00"}>Bien reçu {a.recus}/{a.total}</Chip>}
          </div>
          <div style={{ fontSize: 12.5, color: MUT, marginTop: 2 }}>{a.cible} · {fmtDT(a.date)}</div>
        </summary>
        <div style={{ whiteSpace: "pre-wrap", fontSize: 14, lineHeight: 1.5, marginTop: 8 }}>{a.texte}</div>
        {a.nonLus.length > 0 && <div style={{ fontSize: 12.5, color: MUT, marginTop: 8 }}><b>Pas encore lu :</b> {a.nonLus.join(", ")}</div>}
        {a.nonRecus.length > 0 && <div style={{ fontSize: 12.5, color: "#6B4A00", marginTop: 4 }}><b>Pas encore confirmé :</b> {a.nonRecus.join(", ")}</div>}
        <div style={{ marginTop: 8 }}><DiscBtn a={a} /></div>
      </details>)}
    </div>}
    {tab === "discussions" && <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: 12.5, color: MUT }}>Le fil du staff de chacune de tes équipes, et les réponses aux annonces.</div>
      {!fils.length && <div style={{ color: MUT, fontSize: 13.5 }}>Aucune discussion pour l'instant. Tu n'es rattaché à aucune équipe et personne n'a encore répondu à une annonce.</div>}
      {fils.map((x) => <button key={x.fil} onClick={() => setFil(x.fil)} style={{ display: "flex", gap: 12, alignItems: "center", background: x.unread ? "#FFF9E6" : "#F7F8FA", border: "none", borderLeft: "4px solid " + (x.unread ? YELLOW : BORDER), borderRadius: 14, padding: "12px 14px", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
        <span aria-hidden="true" style={{ width: 40, height: 40, borderRadius: 12, background: x.type === "equipe" ? BLACK : "#E9EBEF", color: x.type === "equipe" ? YELLOW : TEXT, display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto", fontSize: 18 }}><i className={"ti " + (x.type === "equipe" ? "ti-users-group" : "ti-speakerphone")} /></span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "flex", gap: 8, alignItems: "center" }}><b style={{ fontSize: 14.5, color: TEXT, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.titre}</b>{x.last && <span style={{ fontSize: 11.5, color: MUT, whiteSpace: "nowrap" }}>{fmtShort(x.last.date)}</span>}</span>
          <span style={{ display: "block", fontSize: 13, color: x.unread ? TEXT : MUT, fontWeight: x.unread ? 700 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.last ? (x.last.moi ? "Toi" : x.last.auteur) + " : " + x.last.texte : "Aucun message · écris le premier"}</span>
        </span>
        {x.unread > 0 && <span aria-label={x.unread + " non lu(s)"} style={{ background: RED, color: "#fff", borderRadius: 10, minWidth: 20, height: 20, fontSize: 11.5, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 6px" }}>{x.unread}</span>}
      </button>)}
    </div>}
    {compose && <ComposeAnnonce onClose={() => setCompose(false)} onSent={async () => { setCompose(false); setTab("envoyees"); await reload(); }} />}
  </Sheet>;
}

const fmtShort = (iso) => {
  if (!iso) return ""; const d = new Date(iso), now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
};
// Fil de discussion : rechargé toutes les 20 secondes tant qu'il est ouvert et visible.
export function ThreadView({ fil, onBack }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");
  const [txt, setTxt] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = React.useRef(null);
  const lastN = React.useRef(-1);
  const load = useCallback(async () => { try { const j = await post("/api/annonces", { action: "fil", fil }); setD(j); setErr(""); } catch (e) { setErr(e.message); } }, [fil]);
  useEffect(() => {
    load();
    const t = setInterval(() => { if (document.visibilityState === "visible") load(); }, 20000);
    return () => clearInterval(t);
  }, [load]);
  useEffect(() => { if (d && d.messages.length !== lastN.current) { lastN.current = d.messages.length; setTimeout(() => endRef.current && endRef.current.scrollIntoView({ block: "end" }), 30); } }, [d]);
  const send = async () => {
    const t = txt.trim(); if (!t || busy) return;
    setBusy(true);
    try { await post("/api/annonces", { action: "poster", fil, texte: t }); setTxt(""); await load(); } catch (e) { alert(e.message); }
    setBusy(false);
  };
  const del = async (m) => { if (!confirm("Retirer ce message ?")) return; try { await post("/api/annonces", { action: "effacer", id: m.id }); await load(); } catch (e) { alert(e.message); } };
  let prevDay = "";
  return <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
      <button className="btn btn-ghost" onClick={onBack} aria-label="Retour aux discussions" style={{ minHeight: 38, padding: "0 12px", whiteSpace: "nowrap", flex: "0 0 auto" }}><span aria-hidden="true">‹</span> Retour</button>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 800, fontSize: 16, color: TEXT }}>{d ? d.titre : "…"}</div>
        {d && <div style={{ fontSize: 12, color: MUT }}>{d.sous} · {d.participants.join(", ")}</div>}
      </div>
    </div>
    {err && <div style={{ color: "#9E1B1B", fontSize: 13.5 }}>{err}</div>}
    {!d && !err && <div style={{ color: MUT }}>Chargement…</div>}
    {d && <div role="log" aria-label="Messages" style={{ display: "flex", flexDirection: "column", gap: 6, background: "#F4F5F8", borderRadius: 16, padding: 10, minHeight: 160 }}>
      {!d.messages.length && <div style={{ color: MUT, fontSize: 13.5, textAlign: "center", padding: 20 }}>Aucun message. Écris le premier !</div>}
      {d.messages.map((m) => {
        const day = new Date(m.date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
        const sep = day !== prevDay; prevDay = day;
        return <React.Fragment key={m.id}>
          {sep && <div style={{ alignSelf: "center", fontSize: 11.5, fontWeight: 800, color: MUT, padding: "4px 10px", background: "#E9EBEF", borderRadius: 10, margin: "4px 0" }}>{day}</div>}
          <div style={{ alignSelf: m.moi ? "flex-end" : "flex-start", maxWidth: "85%", display: "flex", flexDirection: "column", alignItems: m.moi ? "flex-end" : "flex-start" }}>
            {!m.moi && <span style={{ fontSize: 11.5, fontWeight: 800, color: "#3A3F47", margin: "0 8px 2px" }}>{m.auteur}</span>}
            <div style={{ background: m.moi ? BLACK : "#fff", color: m.moi ? "#fff" : TEXT, borderRadius: m.moi ? "16px 16px 4px 16px" : "16px 16px 16px 4px", padding: "8px 12px", fontSize: 14.5, lineHeight: 1.45, whiteSpace: "pre-wrap", wordBreak: "break-word", boxShadow: "0 1px 2px rgba(0,0,0,.06)" }}>{m.texte}</div>
            <span style={{ fontSize: 11, color: MUT, margin: "2px 8px 0" }}>{new Date(m.date).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}{m.moi && <> · <button onClick={() => del(m)} style={{ background: "none", border: "none", padding: 0, color: MUT, textDecoration: "underline", cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}>retirer</button></>}</span>
          </div>
        </React.Fragment>;
      })}
      <div ref={endRef} />
    </div>}
    {d && <div style={{ display: "flex", gap: 8, alignItems: "flex-end", position: "sticky", bottom: 0, background: "#fff", paddingTop: 6 }}>
      <label htmlFor="msg-txt" style={{ position: "absolute", left: -9999 }}>Ton message</label>
      <textarea id="msg-txt" className="ta" rows={2} maxLength={2000} value={txt} placeholder="Écrire un message…" onChange={(e) => setTxt(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !("ontouchstart" in window)) { e.preventDefault(); send(); } }} style={{ flex: 1, minHeight: 46, resize: "vertical" }} />
      <button className="btn btn-red" disabled={busy || !txt.trim()} onClick={send} aria-label="Envoyer" style={{ minHeight: 46 }}><i className="ti ti-send" aria-hidden="true" />Envoyer</button>
    </div>}
    <div style={{ fontSize: 11.5, color: MUT }}>Les autres participants reçoivent une notification. Les nouveaux messages s'affichent toutes les 20 secondes environ.</div>
  </div>;
}

function ComposeAnnonce({ onClose, onSent }) {
  const [t, setT] = useState(null);
  const [form, setForm] = useState({ target: "", person: "", titre: "", texte: "", accuse: false, mail: false });
  const [busy, setBusy] = useState(false);
  useEffect(() => { post("/api/annonces", { action: "targets" }).then((j) => { setT(j); if (j.groups[0]) setForm((x) => ({ ...x, target: j.groups[0].kind + "|" + (j.groups[0].id || "") })); else setForm((x) => ({ ...x, target: "person|" })); }).catch((e) => setT({ error: e.message, groups: [], people: [] })); }, []);
  if (!t) return <Sheet title="Nouvelle annonce" onClose={onClose}><div style={{ color: MUT }}>Chargement des groupes…</div></Sheet>;
  const [kind, id] = form.target.split("|");
  const g = t.groups.find((x) => x.kind === kind && (x.id || "") === (id || ""));
  const n = kind === "person" ? (form.person ? 1 : 0) : g ? g.n : 0;
  const send = async () => {
    if (!form.titre.trim() || !form.texte.trim()) return alert("Le titre et le message sont obligatoires.");
    if (kind === "person" && !form.person) return alert("Choisis la personne.");
    if (!confirm("Envoyer cette annonce à " + n + " personne(s) ?")) return;
    setBusy(true);
    try {
      const r = await post("/api/annonces", { action: "send", target: kind === "person" ? { kind, id: form.person } : { kind, id: id || undefined }, titre: form.titre, texte: form.texte, accuse: form.accuse, mail: form.mail });
      alert("Annonce envoyée à " + r.destinataires + " personne(s)." + (r.silenced ? "\n" + r.silenced + " personne(s) en période de silence : la notification les attend dans l'appli, sans sonnerie." : "") + (r.mail ? "\n" + r.mail + " copie(s) envoyée(s) par mail." : ""));
      await onSent();
    } catch (e) { alert(e.message); }
    setBusy(false);
  };
  return <Sheet title="Nouvelle annonce" onClose={onClose}>
    {t.error && <div style={{ color: "#9E1B1B" }}>{t.error}</div>}
    <div><label className="lbl" htmlFor="an-to">Destinataires</label>
      <select id="an-to" className="sel" value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })}>
        {t.groups.map((x) => <option key={x.kind + (x.id || "")} value={x.kind + "|" + (x.id || "")}>{x.label} ({x.n})</option>)}
        <option value="person|">Une personne…</option>
      </select></div>
    {kind === "person" && <div><label className="lbl" htmlFor="an-p">Personne</label><select id="an-p" className="sel" value={form.person} onChange={(e) => setForm({ ...form, person: e.target.value })}><option value="">Choisir…</option>{t.people.map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}</select></div>}
    <div><label className="lbl" htmlFor="an-t">Titre</label><input id="an-t" className="inp" maxLength={120} value={form.titre} onChange={(e) => setForm({ ...form, titre: e.target.value })} placeholder="ex. Entraînement déplacé jeudi" /></div>
    <div><label className="lbl" htmlFor="an-x">Message</label><textarea id="an-x" className="ta" rows={6} maxLength={4000} value={form.texte} onChange={(e) => setForm({ ...form, texte: e.target.value })} placeholder="Ton message…" /></div>
    <label style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 14, minHeight: 40, cursor: "pointer" }}><input type="checkbox" checked={form.accuse} onChange={(e) => setForm({ ...form, accuse: e.target.checked })} style={{ width: 18, height: 18, accentColor: RED }} />Demander un « Bien reçu »</label>
    <label style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 14, minHeight: 40, cursor: "pointer" }}><input type="checkbox" checked={form.mail} onChange={(e) => setForm({ ...form, mail: e.target.checked })} style={{ width: 18, height: 18, accentColor: RED }} />Envoyer aussi une copie par mail</label>
    <div style={{ fontSize: 12.5, color: MUT }}>Notification sur le téléphone (sauf pendant la période de silence de chacun) et dans la cloche. Les personnes qui ont choisi « jamais de mail » ne reçoivent pas la copie.</div>
    <div style={{ display: "flex", gap: 8 }}><button className="btn btn-red" disabled={busy || !n} onClick={send}><i className="ti ti-send" aria-hidden="true" />Envoyer · {n} personne(s)</button><button className="btn btn-ghost" onClick={onClose}>Annuler</button></div>
  </Sheet>;
}

// =====================================================================================
// Aide & support
// =====================================================================================
// Guide par profil : [nom, icône, couleur, [[titre, texte, icône], …]]
const ORANGE = "#E8800C";
const GUIDES = {
  all: ["Pour tous", "ti-users", ORANGE, [
    ["Première connexion", "Tu reçois un lien personnel par mail ou par WhatsApp, valable 7 jours. Touche-le, choisis ton mot de passe : c'est fait. Tu te connectes ensuite avec ton adresse e-mail.", "ti-key"],
    ["Installer l'appli", "Un bandeau te le propose une fois connecté. Android et ordinateur (Chrome, Edge) : bouton « Installer ». iPhone et iPad : Safari › Partager › « Sur l'écran d'accueil ». Mac avec Safari : Fichier › « Ajouter au Dock ».", "ti-device-mobile-down"],
    ["Mes espaces", "En haut de l'écran : Pilotage CA, Sportif, Outils, Admin, selon tes droits. Sur téléphone, touche le nom de l'espace sous « VHB Team » pour en changer ; un point jaune signale ce qui t'attend ailleurs.", "ti-layout-grid"],
    ["Mot de passe oublié", "Écran de connexion › « Première connexion ou mot de passe oublié ». Le lien reçu par mail est valable 30 minutes.", "ti-lock-question"],
    ["Annonces et discussions", "Le mégaphone en haut : les annonces reçues (touche « Bien reçu » si on te le demande) et, onglet « Discussions », le fil du staff de chacune de tes équipes.", "ti-speakerphone"],
    ["Notifications et silence", "Ton avatar › Notifications : période de silence (21h–8h par défaut) et copies par mail.", "ti-bell"],
    ["Un problème, une idée ?", "Onglet « Signaler un problème » de cette page : décris-le, ajoute une capture si tu peux. Tu suis la réponse dans « Mes demandes ».", "ti-message-report"],
  ]],
  coach: ["Entraîneur", "ti-whistle", "#D62828", [
    ["Pointer un entraînement", "Sportif › Aujourd'hui : touche la séance du jour. Tout le monde est présent par défaut : touche les absents, puis « Valider ». 10 secondes. Ça marche aussi sans réseau, l'envoi se fait au retour du réseau.", "ti-checklist"],
    ["Pointer un match", "Ouvre le match : coche les joueurs de la feuille de match et saisis le score avec + et −. La victoire est déduite du score.", "ti-trophy"],
    ["Séance supplémentaire, stage, nouveau match", "Depuis l'accueil Sportif : « Nouveau match » ou « Séance supplémentaire ». Pour un stage, choisis s'il compte dans les primes.", "ti-calendar-plus"],
    ["Séance annulée", "Ouvre la séance › « Séance annulée ? » et choisis le motif : elle sort du calcul. « Finalement, la séance a eu lieu » la rétablit.", "ti-calendar-off"],
    ["Ajouter un joueur à une séance", "Dans la séance, sous la liste : « Ajouter un joueur ». Tape son prénom et son nom : s'il est déjà au club, choisis-le ; sinon il est créé. Il entre dans l'équipe en renfort, coché, et un responsable le validera (Effectif ou renfort) dans Joueurs.", "ti-user-plus"],
    ["Corriger un pointage", "Séances : les flèches changent de mois. Une séance reste modifiable tant que le mois de primes n'est pas validé ; ensuite elle est verrouillée.", "ti-pencil"],
    ["Mes joueurs", "Onglet Joueurs : l'effectif en haut, les renforts en bas, avec l'assiduité du mois. Le badge GB repère les gardiens. Touche un joueur pour sa fiche : saison, 10 dernières séances, poste.", "ti-users-group"],
    ["Gérer mon équipe", "Séances › « Entraînements récurrents » ou Joueurs › « Ajouter ou modifier des joueurs » : rythme d'entraînement, effectif, statut Effectif ou Renfort, dates d'entrée et de sortie.", "ti-adjustments"],
    ["Les relances", "Une séance non pointée déclenche un rappel le lendemain ; au bout de 3 jours, le directeur sportif est aussi prévenu.", "ti-alarm"],
  ]],
  ds: ["Primes", "ti-coin-euro", "#F5C518", [
    ["Le tableau du mois", "Sportif › Primes : compteurs du mois, puis un bloc Effectif et un bloc Renforts, chacun avec son sous-total. Les montants évoluent en direct tant que le mois est ouvert.", "ti-table"],
    ["Les règles", "50 € par mois au prorata de la présence (entraînements et matchs), 20 € par victoire pour les joueurs de la feuille de match. Les renforts ne touchent que les primes de victoire. Une séance annulée sort du calcul.", "ti-scale"],
    ["Excuser une absence", "Touche le joueur › « Excuser » sur la séance concernée, avec le motif.", "ti-user-check"],
    ["Prime exceptionnelle, régularisation", "Bouton dédié sous le tableau : montant et motif obligatoire. Après validation d'un mois, une correction passe en régularisation sur le mois suivant.", "ti-plus-minus"],
    ["Valider le mois", "Quand toutes les séances sont pointées : « Valider le mois ». Les montants sont figés et les séances du mois verrouillées.", "ti-circle-check"],
    ["Export et relevé", "« Exporter (Excel) » pour le tableau du mois, « Relevé annuel » pour le récapitulatif de la saison par joueur.", "ti-file-spreadsheet"],
  ]],
  compta: ["Trésorerie", "ti-cash", "#3B8A4E", [
    ["La grille des séances", "Sportif › Primes › « Grille des séances » : une colonne par séance, une ligne par joueur. Touche une case pour passer présent → absent → excusé, c'est enregistré tout de suite. Touche une date pour ouvrir la séance. Lecture seule une fois le mois validé.", "ti-table"],
    ["Valider un joueur ajouté", "Un coach peut ajouter un joueur depuis une séance : il arrive en renfort « à valider ». Dans Joueurs, un encadré orange te propose « Passer en Effectif » ou « Garder en renfort ».", "ti-flag"],
    ["Où sont les paiements", "Sportif › Primes › « Suivi des paiements », ou Admin › Paiements : les lignes des mois validés, filtrables par mois, équipe, statut et nom.", "ti-list-search"],
    ["Mettre en paiement, marquer payé", "Coche les lignes, puis « Mettre en paiement » ou « Marquer payé » avec la date, le mode et une référence.", "ti-cash-banknote"],
    ["Export pour les virements", "« Exporter (Excel) » exporte la liste affichée.", "ti-download"],
  ]],
  admin: ["Administration", "ti-shield-lock", "#16171B", [
    ["Inviter une personne", "Admin › Utilisateurs › « Nouvel utilisateur » (ou Sportif › Équipes › Gérer l'équipe › « Ajouter un entraîneur »). Indique son téléphone si tu veux l'inviter par WhatsApp. Elle reçoit un mail pour créer son mot de passe.", "ti-user-plus"],
    ["Inviter par WhatsApp", "Sur la fiche de la personne ou sa ligne de staff : « WhatsApp » ouvre ta conversation avec le message et le lien déjà prêts, il reste à appuyer sur Envoyer. « Copier le lien » pour un SMS. Le lien du mail reste valable.", "ti-brand-whatsapp"],
    ["Équipes, staff et effectifs", "Sportif › Équipes : « + Nouvelle équipe », puis « Gérer l'équipe » pour le staff, les joueurs (import copier-coller depuis Excel), le rythme et la génération des séances.", "ti-building-community"],
    ["Poste d'un joueur", "Ouvre la fiche du joueur › menu « Poste ». Gardien = badge GB dans les listes.", "ti-shirt-sport"],
    ["Rôles et droits", "Admin › Rôles : un rôle est un ensemble de droits, avec une portée (ses équipes ou toutes). Des droits peuvent être ajoutés à une personne sur sa fiche.", "ti-key"],
    ["Support et journal", "Admin › Support : les demandes de tout le monde (réponds, passe « En cours » puis « Résolu »). Admin › Journal : toutes les actions sensibles, avant → après.", "ti-history"],
  ]],
};
const profilesFor = (rights) => {
  const p = ["all"];
  if (has(rights, "point")) p.push("coach");
  if (["corr", "valid"].some((r) => has(rights, r))) p.push("ds");
  if (has(rights, "compta")) p.push("compta");
  if (["users", "roles", "eff", "support"].some((r) => has(rights, r))) p.push("admin");
  return p;
};

async function shrinkImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = url; });
    const k = Math.min(1, 1600 / Math.max(img.width, img.height));
    const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    const data = c.toDataURL("image/jpeg", 0.82);
    return { filename: (file.name || "capture").replace(/\.[^.]+$/, "") + ".jpg", contentType: "image/jpeg", data: data.split(",")[1], preview: data };
  } finally { URL.revokeObjectURL(url); }
}

export function HelpCenter({ rights, page, initialTab, onClose, onOpenCaGuide, sessionOk }) {
  const [tab, setTab] = useState(initialTab || "guide");
  const profiles = profilesFor(rights);
  const [prof, setProf] = useState(profiles[1] || "all");
  const [q, setQ] = useState("");
  const [form, setForm] = useState({ type: "Bug", texte: "", capture: null });
  const [busy, setBusy] = useState(false);
  const [mine, setMine] = useState(null);
  const loadMine = useCallback(async () => { try { setMine((await post("/api/support", { action: "mine" })).items); } catch (e) { setMine([]); } }, []);
  useEffect(() => { if (tab === "demandes") loadMine(); }, [tab, loadMine]);
  const ql = q.trim().toLowerCase();
  const items = ql ? profiles.flatMap((k) => GUIDES[k][3].map((it) => [k, it])).filter(([, [h, b]]) => (h + " " + b).toLowerCase().includes(ql)) : GUIDES[prof][3].map((it) => [prof, it]);
  const submit = async () => {
    if (form.texte.trim().length < 5) return alert("Décris ton problème ou ta question en quelques mots.");
    setBusy(true);
    const infos = ["Appareil : " + navigator.userAgent, "Écran : " + window.innerWidth + "×" + window.innerHeight + (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches ? " · appli installée" : " · navigateur"), "Heure : " + new Date().toLocaleString("fr-FR"), "Adresse : " + window.location.host].join("\n");
    try {
      const c = form.capture;
      await post("/api/support", { action: "create", type: form.type, texte: form.texte, page, infos, capture: c ? { filename: c.filename, contentType: c.contentType, data: c.data } : undefined });
      setForm({ type: "Bug", texte: "", capture: null }); setTab("demandes");
      alert("Merci ! Ta demande est envoyée. Tu seras prévenu de la réponse.");
    } catch (e) { alert(e.message); }
    setBusy(false);
  };
  const ST = { "Nouveau": ["#FDECEC", "#9E1B1B"], "En cours": ["#FFF6D6", "#6B4A00"], "Résolu": ["#E7F4EA", "#1F5C30"] };
  const back = useBackClose(onClose);
  useEffect(() => { const o = document.body.style.overflow; document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = o; }; }, []);
  const card = { background: "#fff", borderRadius: 20, padding: "16px", boxShadow: "0 1px 3px rgba(20,22,30,.06)" };
  const TABS = [["guide", "Guide", "ti-book-2"], ["signaler", "Signaler un problème", "ti-message-report"], ["demandes", "Mes demandes", "ti-inbox"]];
  return createPortal(<div role="dialog" aria-modal="true" aria-label="Aide et guide" className="fade" style={{ position: "fixed", inset: 0, zIndex: 215, background: "#F2F3F6", overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
    <div style={{ backgroundColor: "#E8590C", backgroundImage: "linear-gradient(rgba(28,10,0,.18), rgba(28,10,0,.38)), url(/accent.jpg)", backgroundSize: "cover", backgroundPosition: "center", color: "#fff", padding: "calc(10px + env(safe-area-inset-top)) 16px 22px" }}>
      <div style={{ maxWidth: 860, margin: "0 auto" }}>
        <button onClick={back} aria-label="Retour" style={{ display: "inline-flex", alignItems: "center", gap: 10, background: "none", border: "none", color: "#fff", fontFamily: "inherit", fontSize: 15, fontWeight: 800, cursor: "pointer", padding: "8px 4px", minHeight: 44 }}><i className="ti ti-chevron-left" aria-hidden="true" style={{ fontSize: 22 }} />Retour</button>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 6 }}>
          <span style={{ width: 60, height: 60, borderRadius: 30, background: YELLOW, color: BLACK, display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto", boxShadow: "0 4px 14px rgba(0,0,0,.18)" }}><i className="ti ti-help" aria-hidden="true" style={{ fontSize: 32 }} /></span>
          <div><div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.1 }}>Aide &amp; guide</div><div style={{ fontSize: 14, fontWeight: 600, opacity: .9, marginTop: 4 }}>VHB Team · Tous Hand'semble</div></div>
        </div>
        <div role="tablist" style={{ display: "flex", gap: 4, background: "rgba(0,0,0,.25)", borderRadius: 30, padding: 4, marginTop: 16, width: "fit-content", maxWidth: "100%", overflowX: "auto" }}>
          {TABS.map(([k, l, ic]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} style={{ minHeight: 38, padding: "0 14px", border: "none", borderRadius: 30, cursor: "pointer", fontFamily: "inherit", fontSize: 13.5, fontWeight: 800, whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 6, background: tab === k ? "#fff" : "transparent", color: tab === k ? BLACK : "#fff" }}><i className={"ti " + ic} aria-hidden="true" />{l}</button>)}
        </div>
      </div>
    </div>
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "16px 12px calc(40px + env(safe-area-inset-bottom))", display: "flex", flexDirection: "column", gap: 14 }}>
      {tab === "guide" && <>
        <div style={{ position: "relative" }}><i className="ti ti-search" aria-hidden="true" style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: MUT, fontSize: 18 }} /><input className="inp" aria-label="Rechercher dans le guide" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher : pointer, excuser, WhatsApp, mot de passe…" style={{ paddingLeft: 40, borderRadius: 16, minHeight: 48, background: "#fff", border: "none", boxShadow: "0 1px 3px rgba(20,22,30,.06)" }} /></div>
        {!ql && <div role="group" aria-label="Profil" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {profiles.map((k) => { const on = prof === k; const [l, ic, col] = GUIDES[k]; return <button key={k} aria-pressed={on} onClick={() => setProf(k)} style={{ minHeight: 40, padding: "0 14px", borderRadius: 30, cursor: "pointer", fontFamily: "inherit", fontSize: 13.5, fontWeight: 800, display: "inline-flex", alignItems: "center", gap: 7, border: on ? "none" : "1px solid #D9DCE1", background: on ? BLACK : "#fff", color: on ? "#fff" : TEXT }}><i className={"ti " + ic} aria-hidden="true" style={{ color: on ? (col === BLACK ? YELLOW : col) : col }} />{l}</button>; })}
          {has(rights, "ca") && <button onClick={onOpenCaGuide} style={{ minHeight: 40, padding: "0 14px", borderRadius: 30, cursor: "pointer", fontFamily: "inherit", fontSize: 13.5, fontWeight: 800, display: "inline-flex", alignItems: "center", gap: 7, border: "1px dashed #B8BDC4", background: "transparent", color: TEXT }}><i className="ti ti-book" aria-hidden="true" />Guide du CA</button>}
        </div>}
        {!ql && <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 2px" }}><span style={{ width: 5, height: 22, borderRadius: 3, background: GUIDES[prof][2] }} /><span style={{ fontSize: 19, fontWeight: 800, color: TEXT }}>{GUIDES[prof][0]}</span><span style={{ fontSize: 13, color: MUT }}>{GUIDES[prof][3].length} fiches</span></div>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 340px), 1fr))", gap: 12 }}>
          {items.map(([k, [h, b, ic]], i) => { const col = GUIDES[k][2]; return <div key={k + i} style={{ ...card, display: "flex", gap: 12, alignItems: "flex-start", borderTop: "4px solid " + col }}>
            <span style={{ width: 42, height: 42, borderRadius: 14, flex: "0 0 auto", display: "flex", alignItems: "center", justifyContent: "center", background: col === BLACK ? BLACK : col + "22", color: col === BLACK ? YELLOW : col === YELLOW ? "#8A6A00" : col }}><i className={"ti " + (ic || "ti-info-circle")} aria-hidden="true" style={{ fontSize: 22 }} /></span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 15.5, fontWeight: 800, color: TEXT }}>{h}</div>
              {ql && <div style={{ fontSize: 11.5, fontWeight: 800, color: MUT, marginTop: 2, letterSpacing: ".04em" }}>{GUIDES[k][0].toUpperCase()}</div>}
              <div style={{ fontSize: 14, color: "#3A3F47", lineHeight: 1.6, marginTop: 4 }}>{b}</div>
            </div>
          </div>; })}
        </div>
        {!items.length && <div style={{ ...card, color: MUT, fontSize: 14 }}>Rien trouvé : essaie un autre mot, ou pose ta question dans « Signaler un problème ».</div>}
        <button onClick={() => setTab("signaler")} style={{ ...card, border: "none", cursor: "pointer", fontFamily: "inherit", textAlign: "left", display: "flex", alignItems: "center", gap: 12, background: BLACK, color: "#fff" }}>
          <i className="ti ti-message-question" aria-hidden="true" style={{ fontSize: 26, color: YELLOW }} />
          <span style={{ flex: 1 }}><span style={{ display: "block", fontWeight: 800, fontSize: 15 }}>Tu ne trouves pas ta réponse ?</span><span style={{ fontSize: 13, opacity: .8 }}>Pose ta question, on te répond dans l'appli.</span></span>
          <i className="ti ti-chevron-right" aria-hidden="true" style={{ fontSize: 20 }} />
        </button>
      </>}
      {tab === "signaler" && <div style={{ ...card, display: "flex", flexDirection: "column", gap: 12, borderTop: "4px solid " + RED }}>{!sessionOk ? <div style={{ fontSize: 13.5, color: "#5C4600", background: "#FFF6D6", borderRadius: 12, padding: 12 }}>Pour envoyer une demande, connecte-toi avec ton mot de passe (bandeau « Créer mon mot de passe »).</div> : <>
        <div role="group" aria-label="Type" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{[["Bug", "Un bug", "ti-bug"], ["Question", "Une question", "ti-help"], ["Idée", "Une idée", "ti-bulb"]].map(([k, l, ic]) => <button key={k} aria-pressed={form.type === k} className={"btn " + (form.type === k ? "btn-dark" : "btn-ghost")} onClick={() => setForm({ ...form, type: k })}><i className={"ti " + ic} aria-hidden="true" />{l}</button>)}</div>
        <div><label className="lbl" htmlFor="sp-t">{form.type === "Bug" ? "Que s'est-il passé ? (ce que tu faisais, ce que tu attendais)" : form.type === "Idée" ? "Ton idée" : "Ta question"}</label><textarea id="sp-t" className="ta" rows={6} value={form.texte} onChange={(e) => setForm({ ...form, texte: e.target.value })} /></div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <label className="btn btn-ghost" style={{ cursor: "pointer" }}><i className="ti ti-camera" aria-hidden="true" />{form.capture ? "Changer la capture" : "Ajouter une capture d'écran"}<input type="file" accept="image/*" style={{ display: "none" }} onChange={async (e) => { const fl = e.target.files && e.target.files[0]; if (fl) { try { setForm({ ...form, capture: await shrinkImage(fl) }); } catch (er) { alert("Image illisible."); } } }} /></label>
          {form.capture && <><img src={form.capture.preview} alt="Capture jointe" style={{ height: 56, borderRadius: 8, border: "1px solid " + BORDER }} /><button className="btn btn-ghost" onClick={() => setForm({ ...form, capture: null })}>Retirer</button></>}
        </div>
        <div style={{ fontSize: 12.5, color: MUT }}>Joints automatiquement : la page « {page} », l'heure et le type d'appareil.</div>
        <button className="btn btn-red" disabled={busy} onClick={submit} style={{ alignSelf: "flex-start" }}><i className="ti ti-send" aria-hidden="true" />Envoyer</button>
      </>}</div>}
      {tab === "demandes" && <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {mine === null && <div style={{ ...card, color: MUT }}>Chargement…</div>}
        {mine && !mine.length && <div style={{ ...card, color: MUT, fontSize: 14 }}>Aucune demande envoyée.</div>}
        {(mine || []).map((x) => <div key={x.id} style={{ ...card, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}><Chip>{x.type}</Chip><span style={{ fontSize: 12.5, color: MUT, flex: 1 }}>{fmtDT(x.date)}{x.page ? " · " + x.page : ""}</span><Chip bg={ST[x.statut][0]} fg={ST[x.statut][1]}>{x.statut}</Chip></div>
          <div style={{ whiteSpace: "pre-wrap", fontSize: 14, color: TEXT }}>{x.texte}</div>
          {x.reponse && <div style={{ background: "#F4F8F5", borderRadius: 12, padding: "10px 12px", borderLeft: "3px solid " + OK }}><div style={{ fontSize: 12, fontWeight: 800, color: "#1F5C30" }}>Réponse{x.reponduPar ? " de " + x.reponduPar : ""} · {fmtDT(x.reponduLe)}</div><div style={{ whiteSpace: "pre-wrap", fontSize: 14, marginTop: 2 }}>{x.reponse}</div></div>}
        </div>)}
      </div>}
    </div>
  </div>, document.body);
}

// ---------------------------------------------------------------- Admin › Support
export function SupportPanel({ focusId }) {
  const [items, setItems] = useState(null);
  const [fil, setFil] = useState("open");
  const [open, setOpen] = useState(focusId || null);
  const [rep, setRep] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { try { setItems((await post("/api/support", { action: "all" })).items); } catch (e) { setItems([]); alert(e.message); } }, []);
  useEffect(() => { load(); }, [load]);
  if (!items) return <div className="card" style={{ color: MUT }}>Chargement des demandes…</div>;
  const ST = { "Nouveau": ["#FDECEC", "#9E1B1B"], "En cours": ["#FFF6D6", "#6B4A00"], "Résolu": ["#E7F4EA", "#1F5C30"] };
  const shown = items.filter((x) => fil === "all" || (fil === "open" ? x.statut !== "Résolu" : x.statut === fil));
  const cur = items.find((x) => x.id === open);
  const act = async (fields) => {
    setBusy(true);
    try { const r = await post("/api/support", { action: "update", id: cur.id, ...fields }); setRep(""); await load(); if (r.notified) alert("Enregistré. " + cur.auteur + " est prévenu(e)."); }
    catch (e) { alert(e.message); }
    setBusy(false);
  };
  const count = (s) => items.filter((x) => x.statut === s).length;
  return <div className="fade" style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 980 }}>
    <Tabs tabs={[["open", "À traiter", count("Nouveau") + count("En cours")], ["Nouveau", "Nouveaux"], ["En cours", "En cours"], ["Résolu", "Résolus"], ["all", "Tous"]]} cur={fil} onTab={setFil} />
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {!shown.length && <div className="card" style={{ color: MUT }}>Aucune demande ici.</div>}
      {shown.map((x) => <button key={x.id} className="card" onClick={() => { setOpen(x.id); setRep(""); }} style={{ textAlign: "left", border: "none", cursor: "pointer", fontFamily: "inherit", display: "flex", flexDirection: "column", gap: 4, padding: "12px 14px" }}>
        <span style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}><Chip>{x.type}</Chip><b style={{ flex: 1 }}>{x.auteur}</b><span style={{ fontSize: 12.5, color: MUT }}>{fmtDT(x.date)}</span><Chip bg={ST[x.statut][0]} fg={ST[x.statut][1]}>{x.statut}</Chip></span>
        <span style={{ fontSize: 13.5, color: "#3A3F47", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.texte}</span>
      </button>)}
    </div>
    {cur && <Sheet title={cur.type + " · " + cur.auteur} onClose={() => setOpen(null)} wide>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><Chip bg={ST[cur.statut][0]} fg={ST[cur.statut][1]}>{cur.statut}</Chip><span style={{ fontSize: 12.5, color: MUT }}>{fmtDT(cur.date)}{cur.page ? " · page « " + cur.page + " »" : ""}</span></div>
      <div style={{ whiteSpace: "pre-wrap", fontSize: 14.5, lineHeight: 1.55 }}>{cur.texte}</div>
      {cur.captures.map((c) => <a key={c.url} href={c.url} target="_blank" rel="noreferrer"><img src={c.thumb} alt={"Capture " + (c.name || "")} style={{ maxWidth: "100%", maxHeight: 320, borderRadius: 10, border: "1px solid " + BORDER }} /></a>)}
      {cur.infos && <details><summary style={{ cursor: "pointer", fontSize: 12.5, color: MUT }}>Infos techniques</summary><pre style={{ whiteSpace: "pre-wrap", fontSize: 12, color: MUT, margin: "6px 0 0" }}>{cur.infos}</pre></details>}
      {cur.reponse && <div style={{ background: "#F7F8FA", borderRadius: 10, padding: "9px 11px", borderLeft: "3px solid " + OK }}><div style={{ fontSize: 12, fontWeight: 800, color: "#1F5C30" }}>Réponse{cur.reponduPar ? " de " + cur.reponduPar : ""} · {fmtDT(cur.reponduLe)}</div><div style={{ whiteSpace: "pre-wrap", fontSize: 14 }}>{cur.reponse}</div></div>}
      <div><label className="lbl" htmlFor="sp-r">{cur.reponse ? "Nouvelle réponse" : "Réponse"} (envoyée à {cur.auteur})</label><textarea id="sp-r" className="ta" rows={4} value={rep} onChange={(e) => setRep(e.target.value)} /></div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="btn btn-red" disabled={busy || !rep.trim()} onClick={() => act({ reponse: rep })}><i className="ti ti-send" aria-hidden="true" />Répondre</button>
        <button className="btn btn-ghost" disabled={busy || !rep.trim()} onClick={() => act({ reponse: rep, statut: "Résolu" })}>Répondre et marquer résolu</button>
        {cur.statut !== "En cours" && <button className="btn btn-ghost" disabled={busy} onClick={() => act({ statut: "En cours" })}>Passer « En cours »</button>}
        {cur.statut !== "Résolu" && <button className="btn btn-ghost" disabled={busy} onClick={() => act({ statut: "Résolu" })}>Marquer résolu</button>}
        {cur.statut === "Résolu" && <button className="btn btn-ghost" disabled={busy} onClick={() => act({ statut: "En cours" })}>Rouvrir</button>}
      </div>
    </Sheet>}
  </div>;
}

// ---------------------------------------------------------------- Mes notifications (dans Mon espace)
const DEF = { silence: true, de: "21:00", a: "08:00", mail: "demande" };
export function NotifPrefs({ me }) {
  const init = (() => { try { return { ...DEF, ...JSON.parse(f(me, "Préférences notifications") || "{}") }; } catch (e) { return DEF; } })();
  const [p, setP] = useState(init);
  const [saved, setSaved] = useState("");
  const save = async (np) => {
    setP(np); setSaved("…");
    try { await db({ action: "update", table: "Utilisateurs", recordId: me.id, fields: { "Préférences notifications": JSON.stringify(np) } }); if (me.fields) me.fields["Préférences notifications"] = JSON.stringify(np); setSaved("Enregistré"); setTimeout(() => setSaved(""), 1800); }
    catch (e) { setSaved(""); alert("Erreur : " + e.message); }
  };
  return <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
    <label style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 14, minHeight: 40, cursor: "pointer" }}><input type="checkbox" checked={p.silence} onChange={(e) => save({ ...p, silence: e.target.checked })} style={{ width: 18, height: 18, accentColor: RED }} />Période de silence (pas de sonnerie sur le téléphone)</label>
    {p.silence && <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
      <div><label className="lbl" htmlFor="np-de">De</label><input id="np-de" type="time" className="inp" value={p.de} onChange={(e) => e.target.value && save({ ...p, de: e.target.value })} style={{ width: "auto" }} /></div>
      <div><label className="lbl" htmlFor="np-a">À</label><input id="np-a" type="time" className="inp" value={p.a} onChange={(e) => e.target.value && save({ ...p, a: e.target.value })} style={{ width: "auto" }} /></div>
    </div>}
    <div><label className="lbl" htmlFor="np-m">Copies par mail des annonces</label>
      <select id="np-m" className="sel" value={p.mail} onChange={(e) => save({ ...p, mail: e.target.value })}>
        <option value="demande">Quand l'expéditeur le demande</option><option value="toujours">Toujours</option><option value="jamais">Jamais</option>
      </select></div>
    <div style={{ fontSize: 12.5, color: MUT }}>Pendant le silence, les annonces arrivent quand même dans l'appli (mégaphone et cloche), sans sonnerie.{saved ? " · " + saved : ""}</div>
  </div>;
}
