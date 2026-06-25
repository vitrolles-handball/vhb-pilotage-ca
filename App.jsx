import React, { useState, useEffect, useCallback, useMemo } from "react";

const LOGO = "/logo.png";
const BLACK = "#141210", RED = "#C0392B", YELLOW = "#F5C518", ORANGE = "#E8800C";
const BG = "#ECEEF2", CARD = "#FFFFFF", TEXT = "#17181B", MUT = "#6B7280", BORDER = "#E6E8EC";
const OK = "#3B8A4E";

const POLE_COLORS = {
  gestion: "#C0392B", secretariat: "#C0562A", developpement: "#C9A227",
  communication: "#9C2B2F", sportif: "#A83328", benevoles: "#B8472B",
};

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Archivo+Black&family=Inter:wght@400;500;600;700&family=Oswald:wght@500;600;700&display=swap');
*{box-sizing:border-box;}
body{margin:0;}
.cond{font-family:'Oswald',sans-serif;letter-spacing:.03em;}
.display{font-family:'Archivo Black',sans-serif;}
.card{background:${CARD};border:1px solid ${BORDER};border-radius:16px;padding:16px 18px;}
.btn{border:none;border-radius:11px;font-size:13px;font-weight:500;cursor:pointer;padding:9px 16px;font-family:inherit;display:inline-flex;align-items:center;gap:7px;}
.btn-red{background:${RED};color:#fff;}
.btn-yellow{background:${YELLOW};color:${BLACK};}
.btn-dark{background:${BLACK};color:#fff;}
.btn-ghost{background:#fff;color:${TEXT};border:1px solid ${BORDER};}
.btn:active{transform:scale(.98);}
.inp,.sel,.ta{width:100%;background:#fff;border:1px solid #DDE1E6;border-radius:10px;color:${TEXT};font-family:inherit;font-size:14px;padding:10px 12px;}
.ta{min-height:70px;resize:vertical;}
.inp:focus,.sel:focus,.ta:focus{outline:none;border-color:${RED};box-shadow:0 0 0 3px rgba(192,57,43,.12);}
.lbl{font-size:12px;color:${MUT};margin:0 0 5px;display:block;}
.navb{background:none;border:none;font-size:13px;color:#D7D9DD;padding:7px 13px;border-radius:20px;cursor:pointer;font-family:inherit;white-space:nowrap;}
.navb.on{background:${RED};color:#fff;}
.chip{font-size:11px;font-weight:500;border-radius:20px;padding:3px 10px;display:inline-flex;align-items:center;gap:5px;}
.tag{font-size:10.5px;font-weight:500;color:#fff;border-radius:7px;padding:2px 8px;}
.fade{animation:fu .35s ease both;}@keyframes fu{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:none;}}
@media (max-width:760px){
  header{padding-top:calc(12px + env(safe-area-inset-top)) !important;}
  .navrow{max-width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;}
  .navrow::-webkit-scrollbar{display:none;}
}
`;

function db(payload) {
  return fetch("/api/db", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).then(async (r) => {
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || ("Erreur " + r.status));
    return j;
  });
}
const esc = (s) => String(s || "").replace(/'/g, "\\'");
const f = (rec, name) => (rec && rec.fields ? rec.fields[name] : undefined);
const initials = (u) => ((f(u, "Prénom") || "")[0] || "") + ((f(u, "Nom") || "")[0] || (f(u, "Email") || "?")[0] || "");
const fullName = (u) => [f(u, "Prénom"), f(u, "Nom")].filter(Boolean).join(" ") || f(u, "Email") || "?";

function dueInfo(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr + "T00:00:00");
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const days = Math.round((d - now) / 86400000);
  if (days < 0) return { label: "Retard " + (-days) + "j", color: RED, urg: 4 };
  if (days <= 1) return { label: days === 0 ? "Aujourd'hui" : "Demain", color: RED, urg: 3 };
  if (days <= 4) return { label: "Dans " + days + "j", color: ORANGE, urg: 2 };
  if (days <= 10) return { label: "Dans " + days + "j", color: "#B8860B", urg: 1 };
  return { label: "Dans " + days + "j", color: MUT, urg: 0 };
}
function resizeImage(file, cb) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const max = 220; let { width, height } = img;
      const scale = Math.min(max / width, max / height, 1);
      const c = document.createElement("canvas");
      c.width = Math.round(width * scale); c.height = Math.round(height * scale);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      cb(c.toDataURL("image/jpeg", 0.82));
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function Avatar({ u, size = 34 }) {
  const photo = f(u, "Photo");
  const st = { width: size, height: size, borderRadius: "50%", flex: "0 0 auto", objectFit: "cover" };
  if (photo && photo.startsWith("data:")) return <img src={photo} alt="" style={st} />;
  return (
    <div style={{ ...st, background: BLACK, color: YELLOW, display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.38, fontWeight: 600, textTransform: "uppercase" }}>
      {initials(u)}
    </div>
  );
}

function Login({ onLogin }) {
  const [email, setEmail] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    const mail = email.trim().toLowerCase();
    if (!mail) return;
    setBusy(true); setErr("");
    try {
      const j = await db({ action: "list", table: "Utilisateurs", filterByFormula: "LOWER({Email})='" + esc(mail) + "'" });
      const u = (j.records || [])[0];
      if (!u) { setErr("Cet email n'est pas autorisé. Demande à un administrateur de te créer un accès."); setBusy(false); return; }
      if (f(u, "Actif") === false) { setErr("Ton accès a été désactivé. Contacte un administrateur."); setBusy(false); return; }
      localStorage.setItem("vhb_email", mail);
      onLogin(u);
    } catch (e) { setErr("Erreur de connexion : " + e.message); setBusy(false); }
  };
  return (
    <div style={{ minHeight: "100vh", background: BG, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <style>{CSS}</style>
      <div className="fade" style={{ textAlign: "center", maxWidth: 380, width: "100%" }}>
        <img src={LOGO} width={96} height={96} alt="VHB" style={{ marginBottom: 14 }} />
        <div className="display" style={{ fontSize: 26, color: TEXT }}>VHB Pilotage</div>
        <div className="cond" style={{ fontSize: 13, color: RED, marginBottom: 26 }}>Tous Hand'semble</div>
        <div className="card" style={{ textAlign: "left" }}>
          <label className="lbl">Ton adresse email</label>
          <input className="inp" type="email" value={email} placeholder="prenom@exemple.com"
            onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
          {err && <div style={{ color: RED, fontSize: 12.5, marginTop: 10, lineHeight: 1.5 }}>{err}</div>}
          <button className="btn btn-red" style={{ width: "100%", justifyContent: "center", marginTop: 14 }} disabled={busy} onClick={submit}>
            {busy ? "Connexion…" : "Entrer"}
          </button>
        </div>
        <div style={{ fontSize: 11, color: MUT, marginTop: 16 }}>1975 — 2025 · 50 ans · Vitrolles Handball Jeunes</div>
      </div>
    </div>
  );
}

function ProfileForm({ me, poles, onSaved }) {
  const [prenom, setPrenom] = useState(f(me, "Prénom") || "");
  const [nom, setNom] = useState(f(me, "Nom") || "");
  const [pole, setPole] = useState((f(me, "Pôle") || [])[0] || "");
  const [fonction, setFonction] = useState(f(me, "Fonction") || "Membre");
  const [tel, setTel] = useState(f(me, "Téléphone") || "");
  const [photo, setPhoto] = useState(f(me, "Photo") || "");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!prenom.trim() || !nom.trim()) return;
    setBusy(true);
    const fields = {
      "Prénom": prenom.trim(), "Nom": nom.trim(), "Fonction": fonction,
      "Téléphone": tel.trim(), "Profil complété": true,
    };
    if (pole) fields["Pôle"] = [pole];
    if (photo) fields["Photo"] = photo;
    try {
      const j = await db({ action: "update", table: "Utilisateurs", recordId: me.id, fields });
      onSaved((j.records || [])[0]);
    } catch (e) { alert("Erreur : " + e.message); setBusy(false); }
  };
  return (
    <div style={{ minHeight: "100vh", background: BG, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <style>{CSS}</style>
      <div className="fade card" style={{ maxWidth: 440, width: "100%" }}>
        <div className="display" style={{ fontSize: 20, color: TEXT, marginBottom: 4 }}>Bienvenue !</div>
        <div style={{ fontSize: 13.5, color: MUT, marginBottom: 18, lineHeight: 1.5 }}>Complète ton profil pour rejoindre l'équipe.</div>
        <div style={{ display: "flex", gap: 12 }}>
          <div style={{ flex: 1 }}><label className="lbl">Prénom</label><input className="inp" value={prenom} onChange={(e) => setPrenom(e.target.value)} /></div>
          <div style={{ flex: 1 }}><label className="lbl">Nom</label><input className="inp" value={nom} onChange={(e) => setNom(e.target.value)} /></div>
        </div>
        <div style={{ marginTop: 12 }}><label className="lbl">Ton pôle</label>
          <select className="sel" value={pole} onChange={(e) => setPole(e.target.value)}>
            <option value="">— Choisir un pôle —</option>
            {poles.map((p) => <option key={p.id} value={p.id}>{f(p, "Pôles")}</option>)}
          </select>
        </div>
        <div style={{ marginTop: 12 }}><label className="lbl">Ta fonction dans le pôle</label>
          <select className="sel" value={fonction} onChange={(e) => setFonction(e.target.value)}>
            <option value="Membre">Membre</option>
            <option value="Responsable">Responsable</option>
          </select>
        </div>
        <div style={{ marginTop: 12 }}><label className="lbl">Téléphone (facultatif)</label><input className="inp" value={tel} onChange={(e) => setTel(e.target.value)} /></div>
        <div style={{ marginTop: 12 }}><label className="lbl">Photo (facultatif)</label>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {photo ? <img src={photo} alt="" style={{ width: 48, height: 48, borderRadius: "50%", objectFit: "cover" }} /> : <div style={{ width: 48, height: 48, borderRadius: "50%", background: BLACK, color: YELLOW, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600 }}>{(prenom[0] || "") + (nom[0] || "")}</div>}
            <label className="btn btn-ghost" style={{ cursor: "pointer" }}>
              Choisir une photo
              <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => e.target.files[0] && resizeImage(e.target.files[0], setPhoto)} />
            </label>
          </div>
        </div>
        <button className="btn btn-red" style={{ width: "100%", justifyContent: "center", marginTop: 20 }} disabled={busy} onClick={save}>
          {busy ? "Enregistrement…" : "Enregistrer mon profil"}
        </button>
      </div>
    </div>
  );
}

function Header({ me, view, setView, isAdmin, onLogout }) {
  const tabs = [["dash", "Tableau de bord"], ["taches", "Tâches"], ["annuaire", "Annuaire"]];
  if (isAdmin) tabs.push(["admin", "Utilisateurs"]);
  return (
    <header style={{ background: BLACK, borderBottom: "3px solid " + RED, padding: "13px 16px", display: "flex", alignItems: "center", gap: 12, position: "sticky", top: 0, zIndex: 30, flexWrap: "wrap" }}>
      <img src={LOGO} width={36} height={36} alt="VHB" style={{ cursor: "pointer", flex: "0 0 auto" }} onClick={() => setView("dash")} />
      <div style={{ lineHeight: 1.1 }}>
        <div className="cond" style={{ fontSize: 15, color: "#F4ECD8", fontWeight: 600 }}>VHB Pilotage</div>
        <div className="cond" style={{ fontSize: 10.5, color: YELLOW, letterSpacing: ".06em" }}>Tous Hand'semble</div>
      </div>
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap", justifyContent: "flex-end" }}>
        <nav className="navrow" style={{ display: "flex", gap: 2, background: "rgba(255,255,255,.1)", borderRadius: 22, padding: 3 }}>
          {tabs.map(([v, l]) => <button key={v} className={"navb" + (view === v ? " on" : "")} onClick={() => setView(v)}>{l}</button>)}
        </nav>
        <div style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer" }} onClick={onLogout} title="Se déconnecter">
          <Avatar u={me} size={30} />
          <span style={{ fontSize: 12.5, color: "#F4ECD8" }}>{f(me, "Prénom") || "Moi"}</span>
        </div>
      </div>
    </header>
  );
}

function Dashboard({ me, data, setView, openNewTask, openNewSujet }) {
  const { tasks, users, poles, meetings } = data;
  const uById = useMemo(() => Object.fromEntries(users.map((u) => [u.id, u])), [users]);
  const pById = useMemo(() => Object.fromEntries(poles.map((p) => [p.id, p])), [poles]);
  const mine = tasks.filter((t) => (f(t, "Assignés") || []).includes(me.id) && f(t, "Statut") !== "Fait")
    .sort((a, b) => ((dueInfo(f(b, "Échéance")) || {}).urg || 0) - ((dueInfo(f(a, "Échéance")) || {}).urg || 0));
  const enCours = tasks.filter((t) => f(t, "Statut") === "En cours");
  const aides = tasks.filter((t) => f(t, "Besoin d'aide"));
  const nextCA = meetings.filter((m) => f(m, "Statut") === "À venir").sort((a, b) => String(f(a, "Date")).localeCompare(String(f(b, "Date"))))[0];
  const poleTag = (t) => { const p = pById[(f(t, "Pôle") || [])[0]]; if (!p) return null; const id = f(p, "Identifiant"); return <span className="tag" style={{ background: POLE_COLORS[id] || BLACK }}>{f(p, "Pôles")}</span>; };

  return (
    <div className="fade">
      {nextCA && (
        <div className="card" style={{ background: BLACK, border: "none", marginBottom: 16, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span className="chip" style={{ background: YELLOW, color: BLACK }}>Prochain CA</span>
          <span style={{ color: "#F4ECD8", fontSize: 14.5 }}>{f(nextCA, "Titre") || "Réunion du CA"} — {f(nextCA, "Date")}{f(nextCA, "Heure") ? " à " + f(nextCA, "Heure") : ""}</span>
          <button className="btn btn-yellow" style={{ marginLeft: "auto" }} onClick={openNewSujet}>Noter un sujet</button>
        </div>
      )}
      <div style={{ fontSize: 22, fontWeight: 500, color: TEXT, marginBottom: 3 }}>Salut {f(me, "Prénom") || ""} 👋</div>
      <div style={{ fontSize: 13.5, color: MUT, marginBottom: 16 }}>Voici où en est le club aujourd'hui.</div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 11, marginBottom: 16 }}>
        <Stat n={mine.length} label="mes tâches en cours" />
        <Stat n={aides.length} label="appels à l'aide" color={aides.length ? RED : TEXT} bg={aides.length ? "#FBEDEC" : "#F1F3F5"} />
        <Stat n={enCours.length} label="tâches du club en cours" />
      </div>

      <div style={{ display: "flex", gap: 9, marginBottom: 18, flexWrap: "wrap" }}>
        <button className="btn btn-red" onClick={openNewTask}>+ Nouvelle tâche</button>
        <button className="btn btn-ghost" onClick={openNewSujet}>Noter un sujet pour le CA</button>
      </div>

      <Section title="Mes tâches">
        {mine.length === 0 ? <Empty t="Rien ne t'est assigné pour le moment." /> :
          mine.slice(0, 8).map((t) => <RowTask key={t.id} t={t} uById={uById} poleTag={poleTag} onClick={() => setView("taches")} />)}
      </Section>

      {aides.length > 0 && (
        <Section title="On demande un coup de main">
          {aides.map((t) => <RowTask key={t.id} t={t} uById={uById} poleTag={poleTag} help onClick={() => setView("taches")} />)}
        </Section>
      )}
    </div>
  );
}
function Stat({ n, label, color = TEXT, bg = "#F1F3F5" }) {
  return <div style={{ background: bg, borderRadius: 14, padding: "13px 15px" }}>
    <div style={{ fontSize: 25, fontWeight: 600, color }}>{n}</div>
    <div style={{ fontSize: 12, color: color === TEXT ? MUT : color, marginTop: 2 }}>{label}</div>
  </div>;
}
function Section({ title, children }) {
  return <div style={{ marginBottom: 18 }}>
    <div className="cond" style={{ fontSize: 12.5, color: MUT, marginBottom: 8, fontWeight: 600 }}>{title}</div>
    {children}
  </div>;
}
function Empty({ t }) { return <div style={{ fontSize: 13, color: MUT, fontStyle: "italic", padding: "6px 2px" }}>{t}</div>; }
function RowTask({ t, uById, poleTag, help, onClick }) {
  const due = dueInfo(f(t, "Échéance"));
  const assignes = (f(t, "Assignés") || []).map((id) => uById[id]).filter(Boolean);
  return (
    <div onClick={onClick} className="card" style={{ padding: "11px 14px", marginBottom: 7, cursor: "pointer", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", borderColor: help ? "#F0C7C3" : BORDER, background: help ? "#FBEDEC" : CARD }}>
      {poleTag(t)}
      <span style={{ fontSize: 14, color: TEXT, flex: 1, minWidth: 140 }}>{f(t, "Titre")}</span>
      {due && <span className="chip" style={{ background: due.color + "1f", color: due.color }}>{due.label}</span>}
      <div style={{ display: "flex" }}>{assignes.slice(0, 3).map((u, i) => <div key={u.id} style={{ marginLeft: i ? -8 : 0 }}><Avatar u={u} size={24} /></div>)}</div>
    </div>
  );
}

function TasksView({ me, data, isAdmin, reload, openNewTask }) {
  const { tasks, users, poles } = data;
  const uById = useMemo(() => Object.fromEntries(users.map((u) => [u.id, u])), [users]);
  const pById = useMemo(() => Object.fromEntries(poles.map((p) => [p.id, p])), [poles]);
  const [fPole, setFPole] = useState("");
  const [fStatut, setFStatut] = useState("");
  const [q, setQ] = useState("");
  const list = tasks.filter((t) => {
    if (fPole && (f(t, "Pôle") || [])[0] !== fPole) return false;
    if (fStatut && f(t, "Statut") !== fStatut) return false;
    if (q && !String(f(t, "Titre") || "").toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });
  return (
    <div className="fade">
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ fontSize: 20, fontWeight: 500, color: TEXT, marginRight: "auto" }}>Tâches</div>
        <button className="btn btn-red" onClick={openNewTask}>+ Nouvelle tâche</button>
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <input className="inp" style={{ flex: 2, minWidth: 150 }} placeholder="Rechercher…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="sel" style={{ flex: 1, minWidth: 120 }} value={fPole} onChange={(e) => setFPole(e.target.value)}>
          <option value="">Tous les pôles</option>
          {poles.map((p) => <option key={p.id} value={p.id}>{f(p, "Pôles")}</option>)}
        </select>
        <select className="sel" style={{ flex: 1, minWidth: 120 }} value={fStatut} onChange={(e) => setFStatut(e.target.value)}>
          <option value="">Tous les statuts</option>
          <option>À faire</option><option>En cours</option><option>Fait</option>
        </select>
      </div>
      {list.length === 0 ? <Empty t="Aucune tâche ne correspond." /> :
        list.map((t) => <TaskCard key={t.id} t={t} me={me} uById={uById} pById={pById} users={users} isAdmin={isAdmin} reload={reload} />)}
    </div>
  );
}

function TaskCard({ t, me, uById, pById, users, isAdmin, reload }) {
  const [busy, setBusy] = useState(false);
  const due = dueInfo(f(t, "Échéance"));
  const pole = pById[(f(t, "Pôle") || [])[0]];
  const poleId = pole ? f(pole, "Identifiant") : null;
  const assignes = (f(t, "Assignés") || []);
  const isMine = assignes.includes(me.id);
  const isSocle = f(t, "Type") === "Socle";
  const canDelete = isSocle ? isAdmin : (isAdmin || (f(t, "Créé par") || []).includes(me.id));
  const statut = f(t, "Statut") || "À faire";

  const update = async (fields) => { setBusy(true); try { await db({ action: "update", table: "Tâches", recordId: t.id, fields }); await reload(); } catch (e) { alert("Erreur : " + e.message); } setBusy(false); };
  const take = () => update({ "Assignés": Array.from(new Set([...assignes, me.id])) });
  const leave = () => update({ "Assignés": assignes.filter((id) => id !== me.id) });
  const cycle = () => update({ "Statut": statut === "À faire" ? "En cours" : statut === "En cours" ? "Fait" : "À faire" });
  const del = async () => { if (!confirm("Supprimer cette tâche ?")) return; setBusy(true); try { await db({ action: "delete", table: "Tâches", recordId: t.id }); await reload(); } catch (e) { alert("Erreur : " + e.message); setBusy(false); } };

  const stColor = statut === "Fait" ? OK : statut === "En cours" ? "#B8860B" : MUT;
  return (
    <div className="card" style={{ marginBottom: 9, padding: "13px 15px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
        {pole && <span className="tag" style={{ background: POLE_COLORS[poleId] || BLACK }}>{f(pole, "Pôles")}</span>}
        {isSocle && <span className="chip" style={{ background: "#EDE7F6", color: "#5E35B1" }}>Socle</span>}
        <span style={{ fontSize: 14.5, color: TEXT, flex: 1, minWidth: 140, fontWeight: 500 }}>{f(t, "Titre")}</span>
        {f(t, "Besoin d'aide") && <span className="chip" style={{ background: "#FBEDEC", color: RED }}>Besoin d'aide</span>}
        {due && <span className="chip" style={{ background: due.color + "1f", color: due.color }}>{due.label}</span>}
      </div>
      {f(t, "Description") && <div style={{ fontSize: 13, color: MUT, marginTop: 7, lineHeight: 1.5 }}>{f(t, "Description")}</div>}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 11, flexWrap: "wrap" }}>
        <button className="btn btn-ghost" style={{ color: stColor, borderColor: stColor + "55", fontSize: 12, padding: "6px 12px" }} disabled={busy} onClick={cycle}>● {statut}</button>
        {isMine ? <button className="btn btn-ghost" style={{ fontSize: 12, padding: "6px 12px" }} disabled={busy} onClick={leave}>Me retirer</button>
          : <button className="btn btn-dark" style={{ fontSize: 12, padding: "6px 12px" }} disabled={busy} onClick={take}>Je prends</button>}
        <button className="btn btn-ghost" style={{ fontSize: 12, padding: "6px 12px" }} disabled={busy} onClick={() => update({ "Besoin d'aide": !f(t, "Besoin d'aide") })}>{f(t, "Besoin d'aide") ? "Aide ✓" : "Besoin d'aide"}</button>
        <div style={{ display: "flex", marginLeft: "auto", alignItems: "center", gap: 6 }}>
          {assignes.map((id) => uById[id]).filter(Boolean).slice(0, 4).map((u, i) => <div key={u.id} title={fullName(u)} style={{ marginLeft: i ? -8 : 0 }}><Avatar u={u} size={26} /></div>)}
          {canDelete && <button className="btn btn-ghost" style={{ color: RED, fontSize: 12, padding: "6px 10px", borderColor: "#F0C7C3" }} disabled={busy} onClick={del}>Suppr.</button>}
        </div>
      </div>
    </div>
  );
}

function Modal({ children, onClose }) {
  return <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(20,18,16,.5)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 20, zIndex: 50, overflowY: "auto" }}>
    <div onClick={(e) => e.stopPropagation()} className="fade card" style={{ maxWidth: 480, width: "100%", marginTop: 40 }}>{children}</div>
  </div>;
}
function NewTask({ me, data, isAdmin, onClose, reload }) {
  const { poles, users } = data;
  const [titre, setTitre] = useState("");
  const [desc, setDesc] = useState("");
  const [pole, setPole] = useState((f(me, "Pôle") || [])[0] || "");
  const [type, setType] = useState("Ponctuelle");
  const [ech, setEch] = useState("");
  const [assignes, setAssignes] = useState([me.id]);
  const [busy, setBusy] = useState(false);
  const toggle = (id) => setAssignes((a) => a.includes(id) ? a.filter((x) => x !== id) : [...a, id]);
  const save = async () => {
    if (!titre.trim()) return; setBusy(true);
    const fields = { "Titre": titre.trim(), "Description": desc.trim(), "Type": type, "Statut": "À faire", "Créé par": [me.id], "Assignés": assignes };
    if (pole) fields["Pôle"] = [pole];
    if (ech) fields["Échéance"] = ech;
    try { await db({ action: "create", table: "Tâches", fields }); await reload(); onClose(); } catch (e) { alert("Erreur : " + e.message); setBusy(false); }
  };
  return (
    <Modal onClose={onClose}>
      <div style={{ fontSize: 18, fontWeight: 500, marginBottom: 14 }}>Nouvelle tâche</div>
      <label className="lbl">Titre</label>
      <input className="inp" value={titre} onChange={(e) => setTitre(e.target.value)} autoFocus />
      <div style={{ marginTop: 11 }}><label className="lbl">Description (facultatif)</label><textarea className="ta" value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
      <div style={{ display: "flex", gap: 11, marginTop: 11 }}>
        <div style={{ flex: 1 }}><label className="lbl">Pôle</label>
          <select className="sel" value={pole} onChange={(e) => setPole(e.target.value)}>
            <option value="">—</option>{poles.map((p) => <option key={p.id} value={p.id}>{f(p, "Pôles")}</option>)}
          </select>
        </div>
        <div style={{ flex: 1 }}><label className="lbl">Échéance</label><input className="inp" type="date" value={ech} onChange={(e) => setEch(e.target.value)} /></div>
      </div>
      {isAdmin && (
        <div style={{ marginTop: 11 }}><label className="lbl">Type</label>
          <select className="sel" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="Ponctuelle">Ponctuelle</option>
            <option value="Socle">Socle (officielle du pôle)</option>
          </select>
        </div>
      )}
      <div style={{ marginTop: 11 }}><label className="lbl">Affecter à</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
          {users.filter((u) => f(u, "Profil complété")).map((u) => {
            const on = assignes.includes(u.id);
            return <button key={u.id} onClick={() => toggle(u.id)} className="chip" style={{ cursor: "pointer", border: "1px solid " + (on ? RED : BORDER), background: on ? "#FBEDEC" : "#fff", color: on ? RED : TEXT, padding: "5px 10px" }}>
              <Avatar u={u} size={18} />{f(u, "Prénom")}
            </button>;
          })}
        </div>
      </div>
      <div style={{ display: "flex", gap: 9, marginTop: 18 }}>
        <button className="btn btn-ghost" style={{ flex: 1, justifyContent: "center" }} onClick={onClose}>Annuler</button>
        <button className="btn btn-red" style={{ flex: 2, justifyContent: "center" }} disabled={busy} onClick={save}>{busy ? "…" : "Créer la tâche"}</button>
      </div>
    </Modal>
  );
}
function NewSujet({ me, data, onClose, reload }) {
  const { poles } = data;
  const [titre, setTitre] = useState("");
  const [theme, setTheme] = useState("Divers");
  const [desc, setDesc] = useState("");
  const [pole, setPole] = useState("");
  const [busy, setBusy] = useState(false);
  const themes = ["Finances", "Sportif", "Événements", "Bénévoles", "Communication", "Administratif", "Partenariats", "Divers"];
  const save = async () => {
    if (!titre.trim()) return; setBusy(true);
    const fields = { "Titre": titre.trim(), "Thème": theme, "Description": desc.trim(), "Statut": "À traiter", "Proposé par": [me.id] };
    if (pole) fields["Pôle"] = [pole];
    try { await db({ action: "create", table: "Sujets CA", fields }); await reload(); onClose(); } catch (e) { alert("Erreur : " + e.message); setBusy(false); }
  };
  return (
    <Modal onClose={onClose}>
      <div style={{ fontSize: 18, fontWeight: 500, marginBottom: 4 }}>Noter un sujet pour le CA</div>
      <div style={{ fontSize: 13, color: MUT, marginBottom: 14 }}>Il sera ajouté à la banque de sujets à aborder.</div>
      <label className="lbl">Sujet</label><input className="inp" value={titre} onChange={(e) => setTitre(e.target.value)} autoFocus />
      <div style={{ display: "flex", gap: 11, marginTop: 11 }}>
        <div style={{ flex: 1 }}><label className="lbl">Thème</label><select className="sel" value={theme} onChange={(e) => setTheme(e.target.value)}>{themes.map((x) => <option key={x}>{x}</option>)}</select></div>
        <div style={{ flex: 1 }}><label className="lbl">Pôle (facultatif)</label><select className="sel" value={pole} onChange={(e) => setPole(e.target.value)}><option value="">—</option>{poles.map((p) => <option key={p.id} value={p.id}>{f(p, "Pôles")}</option>)}</select></div>
      </div>
      <div style={{ marginTop: 11 }}><label className="lbl">Précisions (facultatif)</label><textarea className="ta" value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
      <div style={{ display: "flex", gap: 9, marginTop: 18 }}>
        <button className="btn btn-ghost" style={{ flex: 1, justifyContent: "center" }} onClick={onClose}>Annuler</button>
        <button className="btn btn-red" style={{ flex: 2, justifyContent: "center" }} disabled={busy} onClick={save}>{busy ? "…" : "Ajouter le sujet"}</button>
      </div>
    </Modal>
  );
}

function Annuaire({ data }) {
  const { users, poles } = data;
  const pById = Object.fromEntries(poles.map((p) => [p.id, p]));
  const byPole = {};
  users.filter((u) => f(u, "Profil complété")).forEach((u) => { const pid = (f(u, "Pôle") || [])[0] || "_"; (byPole[pid] = byPole[pid] || []).push(u); });
  const order = [...poles.map((p) => p.id), "_"];
  return (
    <div className="fade">
      <div style={{ fontSize: 20, fontWeight: 500, color: TEXT, marginBottom: 14 }}>Annuaire du CA</div>
      {order.filter((pid) => byPole[pid]).map((pid) => {
        const p = pById[pid]; const id = p ? f(p, "Identifiant") : null;
        return <div key={pid} style={{ marginBottom: 18 }}>
          <div className="cond" style={{ fontSize: 13, fontWeight: 600, marginBottom: 9, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 11, height: 11, borderRadius: "50%", background: POLE_COLORS[id] || MUT, display: "inline-block" }} />
            {p ? f(p, "Pôles") : "Sans pôle"}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 10 }}>
            {byPole[pid].sort((a, b) => (f(a, "Fonction") === "Responsable" ? -1 : 1)).map((u) => (
              <div key={u.id} className="card" style={{ padding: "12px 14px", display: "flex", alignItems: "center", gap: 11 }}>
                <Avatar u={u} size={42} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: TEXT }}>{fullName(u)}</div>
                  <div style={{ fontSize: 12, color: f(u, "Fonction") === "Responsable" ? RED : MUT }}>{f(u, "Fonction") || "Membre"}{f(u, "Rôle") === "Admin" ? " · admin" : ""}</div>
                  {f(u, "Téléphone") && <div style={{ fontSize: 11.5, color: MUT }}>{f(u, "Téléphone")}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>;
      })}
    </div>
  );
}

function AdminUsers({ me, data, reload }) {
  const { users } = data;
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("Équipier");
  const [busy, setBusy] = useState(false);
  const add = async () => {
    const mail = email.trim().toLowerCase(); if (!mail) return;
    if (users.some((u) => String(f(u, "Email") || "").toLowerCase() === mail)) { alert("Cet email existe déjà."); return; }
    setBusy(true);
    try { await db({ action: "create", table: "Utilisateurs", fields: { "Email": mail, "Rôle": role, "Actif": true, "Profil complété": false } }); setEmail(""); await reload(); } catch (e) { alert("Erreur : " + e.message); }
    setBusy(false);
  };
  const toggleRole = async (u) => { await db({ action: "update", table: "Utilisateurs", recordId: u.id, fields: { "Rôle": f(u, "Rôle") === "Admin" ? "Équipier" : "Admin" } }); reload(); };
  const toggleActif = async (u) => { await db({ action: "update", table: "Utilisateurs", recordId: u.id, fields: { "Actif": !(f(u, "Actif") !== false) } }); reload(); };
  const del = async (u) => { if (!confirm("Supprimer définitivement " + fullName(u) + " ?")) return; await db({ action: "delete", table: "Utilisateurs", recordId: u.id }); reload(); };
  return (
    <div className="fade">
      <div style={{ fontSize: 20, fontWeight: 500, color: TEXT, marginBottom: 4 }}>Utilisateurs</div>
      <div style={{ fontSize: 13, color: MUT, marginBottom: 16 }}>Crée un accès par email. La personne complètera son profil à sa première connexion.</div>
      <div className="card" style={{ marginBottom: 18, display: "flex", gap: 9, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div style={{ flex: 2, minWidth: 180 }}><label className="lbl">Email du nouvel utilisateur</label><input className="inp" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="prenom@exemple.com" /></div>
        <div style={{ flex: 1, minWidth: 120 }}><label className="lbl">Rôle</label><select className="sel" value={role} onChange={(e) => setRole(e.target.value)}><option>Équipier</option><option>Admin</option></select></div>
        <button className="btn btn-red" disabled={busy} onClick={add}>+ Ajouter</button>
      </div>
      {users.map((u) => {
        const actif = f(u, "Actif") !== false;
        return <div key={u.id} className="card" style={{ marginBottom: 8, padding: "11px 14px", display: "flex", alignItems: "center", gap: 11, flexWrap: "wrap", opacity: actif ? 1 : .55 }}>
          <Avatar u={u} size={34} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 14, color: TEXT }}>{fullName(u)} {!f(u, "Profil complété") && <span style={{ fontSize: 11, color: ORANGE }}>· en attente</span>}</div>
            <div style={{ fontSize: 12, color: MUT }}>{f(u, "Email")}</div>
          </div>
          <button className="chip" style={{ cursor: "pointer", border: "1px solid " + BORDER, background: f(u, "Rôle") === "Admin" ? BLACK : "#fff", color: f(u, "Rôle") === "Admin" ? YELLOW : TEXT, padding: "5px 11px" }} onClick={() => toggleRole(u)}>{f(u, "Rôle") || "Équipier"}</button>
          {u.id !== me.id && <>
            <button className="btn btn-ghost" style={{ fontSize: 12, padding: "6px 10px" }} onClick={() => toggleActif(u)}>{actif ? "Désactiver" : "Réactiver"}</button>
            <button className="btn btn-ghost" style={{ fontSize: 12, padding: "6px 10px", color: RED, borderColor: "#F0C7C3" }} onClick={() => del(u)}>Suppr.</button>
          </>}
        </div>;
      })}
    </div>
  );
}

export default function App() {
  const [status, setStatus] = useState("loading");
  const [me, setMe] = useState(null);
  const [view, setView] = useState("dash");
  const [data, setData] = useState({ poles: [], users: [], tasks: [], meetings: [] });
  const [modal, setModal] = useState(null);

  const loadData = useCallback(async () => {
    const [poles, users, tasks, meetings] = await Promise.all([
      db({ action: "list", table: "Pôles" }),
      db({ action: "list", table: "Utilisateurs" }),
      db({ action: "list", table: "Tâches" }),
      db({ action: "list", table: "Réunions" }),
    ]);
    setData({ poles: poles.records || [], users: users.records || [], tasks: tasks.records || [], meetings: meetings.records || [] });
  }, []);

  useEffect(() => {
    (async () => {
      const mail = localStorage.getItem("vhb_email");
      if (!mail) { setStatus("login"); return; }
      try {
        const j = await db({ action: "list", table: "Utilisateurs", filterByFormula: "LOWER({Email})='" + esc(mail) + "'" });
        const u = (j.records || [])[0];
        if (!u || f(u, "Actif") === false) { localStorage.removeItem("vhb_email"); setStatus("login"); return; }
        setMe(u);
        await loadData();
        setStatus(f(u, "Profil complété") ? "app" : "profile");
      } catch (e) { setStatus("login"); }
    })();
  }, [loadData]);

  const onLogin = async (u) => { setMe(u); await loadData(); setStatus(f(u, "Profil complété") ? "app" : "profile"); };
  const onProfileSaved = async (u) => { setMe(u); await loadData(); setStatus("app"); };
  const logout = () => { if (!confirm("Se déconnecter ?")) return; localStorage.removeItem("vhb_email"); setMe(null); setStatus("login"); };
  const refreshMe = useCallback(async () => {
    const mail = localStorage.getItem("vhb_email"); if (!mail) return;
    const j = await db({ action: "list", table: "Utilisateurs", filterByFormula: "LOWER({Email})='" + esc(mail) + "'" });
    const u = (j.records || [])[0]; if (u) setMe(u);
  }, []);
  const reload = useCallback(async () => { await loadData(); await refreshMe(); }, [loadData, refreshMe]);

  if (status === "loading") return <Splash />;
  if (status === "login") return <Login onLogin={onLogin} />;
  if (status === "profile") return <ProfileForm me={me} poles={data.poles} onSaved={onProfileSaved} />;

  const isAdmin = f(me, "Rôle") === "Admin";
  return (
    <div style={{ minHeight: "100vh", background: BG, color: TEXT, fontFamily: "'Inter',system-ui,sans-serif" }}>
      <style>{CSS}</style>
      <Header me={me} view={view} setView={setView} isAdmin={isAdmin} onLogout={logout} />
      <div style={{ maxWidth: 920, margin: "0 auto", padding: "22px 16px 60px" }}>
        {view === "dash" && <Dashboard me={me} data={data} setView={setView} openNewTask={() => setModal("task")} openNewSujet={() => setModal("sujet")} />}
        {view === "taches" && <TasksView me={me} data={data} isAdmin={isAdmin} reload={reload} openNewTask={() => setModal("task")} />}
        {view === "annuaire" && <Annuaire data={data} />}
        {view === "admin" && isAdmin && <AdminUsers me={me} data={data} reload={reload} />}
      </div>
      {modal === "task" && <NewTask me={me} data={data} isAdmin={isAdmin} onClose={() => setModal(null)} reload={reload} />}
      {modal === "sujet" && <NewSujet me={me} data={data} onClose={() => setModal(null)} reload={reload} />}
    </div>
  );
}
function Splash() {
  return <div style={{ minHeight: "100vh", background: BG, display: "flex", alignItems: "center", justifyContent: "center" }}>
    <style>{CSS}</style>
    <img src={LOGO} width={80} height={80} alt="VHB" style={{ opacity: .85 }} />
  </div>;
}
