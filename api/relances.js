// Relances quotidiennes (Cron Vercel, voir vercel.json) :
//  1) Compte-rendus en attente de signature -> rappel aux signataires (Président/Secrétaire) qui n'ont pas signé.
//  2) Réunions à venir -> rappel de réponse (présent/absent) aux membres qui n'ont pas répondu.
// Utilise les variables déjà présentes : AIRTABLE_TOKEN, AIRTABLE_BASE_ID, RESEND_API_KEY, MAIL_FROM.
import { BASE as LIB_BASE, sendMail as libSendMail } from "./_lib.js";
const BASE = LIB_BASE; // base de test sur les adresses de prévisualisation
const TOKEN = process.env.AIRTABLE_TOKEN;
const KEY = process.env.RESEND_API_KEY;
const APP = process.env.APP_URL || "https://vhb-pilotage-ca.vercel.app";

const T_REUNIONS = "tbl0i3NT6K1SjZHmz";
const T_UTILISATEURS = "tblyXO6nxbMSl2Qh5";
const T_REGLAGES = "tblpH4TRohqkOZJvx";

async function at(path) {
  let all = [], offset;
  do {
    const u = "https://api.airtable.com/v0/" + BASE + "/" + path + (path.includes("?") ? "&" : "?") + "pageSize=100" + (offset ? "&offset=" + offset : "");
    const r = await fetch(u, { headers: { Authorization: "Bearer " + TOKEN } });
    const t = await r.text();
    if (!r.ok) throw new Error("Airtable " + r.status + " : " + t);
    const j = JSON.parse(t);
    all = all.concat(j.records || []); offset = j.offset;
  } while (offset);
  return all;
}
async function sendMail(to, subject, html) {
  // Redirigé vers MAIL_TEST_TO sur les adresses de test (voir _lib.js).
  await libSendMail(to, subject, html);
}
async function patch(table, id, fields) {
  const r = await fetch("https://api.airtable.com/v0/" + BASE + "/" + table + "/" + id, { method: "PATCH", headers: { Authorization: "Bearer " + TOKEN, "Content-Type": "application/json" }, body: JSON.stringify({ fields, typecast: true }) });
  if (!r.ok) throw new Error("Airtable PATCH " + r.status);
}
function frDate(s) { if (!s) return ""; const d = String(s).slice(0, 10).split("-"); return d.length === 3 ? d[2] + "/" + d[1] + "/" + d[0] : String(s); }
function wrap(title, bodyHtml) {
  return '<div style="font-family:Arial,Helvetica,sans-serif;color:#333;max-width:560px;margin:auto">'
    + '<div style="background:#16171B;padding:16px 20px;color:#fff;border-radius:12px 12px 0 0"><span style="font-weight:800;font-size:16px">VHB Team</span> <span style="color:#F5C518;font-size:12px">Tous Hand\'semble</span></div>'
    + '<div style="border:1px solid #eee;border-top:none;padding:20px;border-radius:0 0 12px 12px">' + (title ? '<h2 style="margin:0 0 12px;font-size:17px;color:#16171B">' + title + '</h2>' : '') + bodyHtml + '</div>'
    + '<div style="color:#9aa0a6;font-size:11px;padding:10px 4px">Rappel automatique · Vitrolles Handball Jeunes</div></div>';
}
const btn = (href, label, color) => '<a href="' + href + '" style="background:' + color + ';color:#fff;text-decoration:none;padding:11px 18px;border-radius:10px;font-weight:700;display:inline-block;margin:4px">' + label + '</a>';

const enc = encodeURIComponent;
async function relancePointages(users) {
  const formula = "AND({Statut}='Prévue', IS_BEFORE({Date}, TODAY()), IS_AFTER({Date}, DATEADD(TODAY(), -31, 'days')))";
  const late = await at(enc("Séances") + "?filterByFormula=" + enc(formula));
  if (!late.length) return 0;
  const [staff, roles, teams] = await Promise.all([at(enc("Staff")), at(enc("Rôles")), at(enc("Équipes"))]);
  const dsRoles = roles.filter((r) => r.fields["Portée"] === "Toutes" && (r.fields["Droits"] || []).includes("valid") && !r.fields["Verrouillé"]).map((r) => r.id);
  const actif = (u) => u && u.fields["Actif"] !== false && u.fields["Email"];
  const ds = users.filter((u) => actif(u) && (u.fields["Rôles"] || []).some((id) => dsRoles.includes(id)));
  const byTeam = {};
  late.forEach((s) => { const t = (s.fields["Équipe"] || [])[0]; if (t) (byTeam[t] = byTeam[t] || []).push(s); });
  const today = new Date(); today.setHours(12, 0, 0, 0);
  const daysLate = (d) => Math.round((today - new Date(String(d) + "T12:00:00")) / 86400000);
  let sent = 0;
  for (const [teamId, list] of Object.entries(byTeam)) {
    const team = teams.find((t) => t.id === teamId);
    const tName = (team && team.fields["Nom"]) || "ton équipe";
    const staffUsers = staff.filter((s) => (s.fields["Équipe"] || []).includes(teamId)).map((s) => users.find((u) => u.id === (s.fields["Personne"] || [])[0])).filter(actif);
    const max = Math.max(...list.map((s) => daysLate(s.fields["Date"])));
    const dest = [...new Map(staffUsers.concat(max >= 3 ? ds : []).map((u) => [u.fields["Email"].toLowerCase(), u])).values()];
    if (!dest.length) continue;
    list.sort((a, b) => String(a.fields["Date"]).localeCompare(String(b.fields["Date"])));
    const items = list.map((s) => '<li style="margin:4px 0"><b>' + frDate(s.fields["Date"]) + '</b>' + (s.fields["Heure"] ? ' à ' + s.fields["Heure"] : '') + ' · ' + (s.fields["Type"] || "Séance") + (s.fields["Adversaire"] ? ' contre ' + s.fields["Adversaire"] : '') + ' <span style="color:#9E1B1B">(il y a ' + daysLate(s.fields["Date"]) + ' j)</span></li>').join("");
    const n = list.length;
    for (const u of dest) {
      const isStaff = staffUsers.includes(u);
      const html = wrap(n > 1 ? n + " séances à pointer" : "Une séance à pointer",
        '<p>Bonjour ' + (u.fields["Prénom"] || "") + ',</p><p>' + (isStaff ? "Il reste à pointer pour <b>" + tName + "</b> :" : "Pour information, ces séances de <b>" + tName + "</b> ne sont toujours pas pointées :") + '</p><ul style="padding-left:18px">' + items + '</ul>'
        + '<p style="color:#666;font-size:13px">Dix secondes par séance : tout le monde est présent par défaut, il suffit de toucher les absents. Une séance qui n\'a pas eu lieu se déclare « annulée ».</p>'
        + '<p style="margin-top:14px">' + btn(APP, "Pointer maintenant", "#D62828") + '</p>');
      try { await sendMail(u.fields["Email"], "À pointer — " + tName + (n > 1 ? " · " + n + " séances" : ""), html); sent++; } catch (e) {}
    }
    for (const s of list) { try { await patch(enc("Séances"), s.id, { "Relances": (s.fields["Relances"] || 0) + 1 }); } catch (e) {} }
  }
  return sent;
}

export default async function handler(req, res) {
  if (!TOKEN || !BASE || !KEY) { res.status(500).json({ error: "Configuration manquante." }); return; }
  const secret = process.env.CRON_SECRET;
  if (secret) { const auth = req.headers["authorization"] || ""; if (auth !== "Bearer " + secret) { res.status(401).json({ error: "Unauthorized" }); return; } }
  try {
    const reunions = await at(T_REUNIONS);
    const users = await at(T_UTILISATEURS);
    const actifs = users.filter((u) => u.fields["Actif"] !== false && u.fields["Email"]);

    // Délai d'envoi des invitations, réglé dans l'appli (Réunions > Planificateur).
    let joursAvant = 10;
    try {
      const regl = await at(T_REGLAGES);
      const r = regl.find((x) => x.fields["Clé"] === "planificateur");
      if (r && r.fields["Valeur"]) { const v = JSON.parse(r.fields["Valeur"]); if (Number(v.inviterJoursAvant) > 0) joursAvant = Number(v.inviterJoursAvant); }
    } catch (e) {}
    const dansNjours = (d) => (new Date(String(d) + "T00:00:00").getTime() - Date.now()) / 86400000;

    let sign = 0, rsvp = 0, invit = 0;

    // 0) Invitation initiale, envoyée une seule fois, à l'approche de la réunion.
    // Les CA créés par le planificateur sont silencieux jusqu'à ce moment-là :
    // c'est ce qui évite d'envoyer toute la saison de mails en une fois.
    for (const m of reunions) {
      if (m.fields["Statut"] === "Passée" || m.fields["Invitation envoyée"] || !m.fields["Date"]) continue;
      const j = dansNjours(m.fields["Date"]);
      if (j > joursAvant || j < 0) continue;
      const titre = m.fields["Titre"] || "Réunion du CA";
      for (const u of actifs) {
        const html = wrap("Un CA est programmé", '<p>Bonjour ' + (u.fields["Prénom"] || "") + ',</p><p>Une réunion du CA est prévue le <b>' + frDate(m.fields["Date"]) + '</b>' + (m.fields["Heure"] ? ' à <b>' + m.fields["Heure"] + '</b>' : '') + (m.fields["Lieu"] ? ' · ' + m.fields["Lieu"] : '') + '.</p><p>Merci d\'indiquer si tu seras présent :</p><p style="margin-top:14px">' + btn(APP + "/?rsvp=" + m.id + "&r=present", "Je serai présent", "#2E8B57") + btn(APP + "/?rsvp=" + m.id + "&r=absent", "Je serai absent", "#D62828") + '</p>');
        try { await sendMail(u.fields["Email"], "CA du " + frDate(m.fields["Date"]) + " — " + titre, html); invit++; } catch (e) {}
      }
      try { await patch(T_REUNIONS, m.id, { "Invitation envoyée": true }); } catch (e) {}
    }

    // 1) Signatures manquantes
    for (const m of reunions) {
      if (m.fields["Validation CR"] !== "En attente de signature") continue;
      const titre = m.fields["Titre"] || "Réunion du CA";
      for (const u of actifs) {
        const b = u.fields["Bureau"];
        const slot = b === "Président" ? "Signature Président" : b === "Secrétaire" ? "Signature Secrétaire" : null;
        if (!slot || m.fields[slot]) continue; // pas signataire, ou a déjà signé
        const html = wrap("Compte-rendu à signer", '<p>Bonjour ' + (u.fields["Prénom"] || "") + ',</p><p>Le compte-rendu de <b>' + titre + '</b>' + (m.fields["Date"] ? ' du <b>' + frDate(m.fields["Date"]) + '</b>' : '') + ' attend ta signature.</p><p style="margin-top:14px">' + btn(APP + "/?sign=" + m.id, "Signer le compte-rendu", "#D62828") + '</p>');
        try { await sendMail(u.fields["Email"], "Rappel : compte-rendu à signer — " + titre, html); sign++; } catch (e) {}
      }
    }

    // 2) Réponses de présence manquantes (réunions à venir)
    for (const m of reunions) {
      if (m.fields["Statut"] === "Passée" || !m.fields["Date"]) continue;
      // Uniquement dans les 3 derniers jours, et seulement si l'invitation est partie.
      // Sans cette borne, chaque réunion de la saison générait un rappel PAR JOUR.
      if (!m.fields["Invitation envoyée"]) continue;
      const jr = dansNjours(m.fields["Date"]);
      if (jr > 3 || jr < 0) continue;
      const titre = m.fields["Titre"] || "Réunion du CA";
      const rep = [].concat(m.fields["Répondu présent"] || [], m.fields["Répondu absent"] || []);
      for (const u of actifs) {
        if (rep.includes(u.id)) continue;
        const html = wrap("Réponds à l'invitation", '<p>Bonjour ' + (u.fields["Prénom"] || "") + ',</p><p>Une réunion du CA est prévue' + (m.fields["Date"] ? ' le <b>' + frDate(m.fields["Date"]) + '</b>' : '') + (m.fields["Heure"] ? ' à <b>' + m.fields["Heure"] + '</b>' : '') + '. Merci d\'indiquer si tu seras présent :</p><p style="margin-top:14px">' + btn(APP + "/?rsvp=" + m.id + "&r=present", "Je serai présent", "#2E8B57") + btn(APP + "/?rsvp=" + m.id + "&r=absent", "Je serai absent", "#D62828") + '</p>');
        try { await sendMail(u.fields["Email"], "Rappel : réponse attendue — " + titre, html); rsvp++; } catch (e) {}
      }
    }

    // 3) Rappel 48h avant : inviter à remplir l'ordre du jour
    let odj = 0;
    const now = Date.now();
    for (const m of reunions) {
      if (m.fields["Statut"] === "Passée" || m.fields["Relance ODJ envoyée"] || !m.fields["Date"]) continue;
      const days = (new Date(m.fields["Date"] + "T00:00:00").getTime() - now) / 86400000;
      if (days > 2 || days < -1) continue;
      const titre = m.fields["Titre"] || "Réunion du CA";
      for (const u of actifs) {
        const html = wrap("Prépare l'ordre du jour du CA", '<p>Bonjour ' + (u.fields["Prénom"] || "") + ',</p><p>Le CA <b>' + titre + '</b>' + (m.fields["Date"] ? ' du <b>' + frDate(m.fields["Date"]) + '</b>' : '') + ' approche (dans moins de 48h). Pense à <b>mettre tes tâches et tes sujets à l\'ordre du jour</b>.</p><p style="margin-top:14px">' + btn(APP, "Ouvrir VHB Team", "#D62828") + '</p>');
        try { await sendMail(u.fields["Email"], "Prépare l'ordre du jour — " + titre, html); odj++; } catch (e) {}
      }
      try { await patch(T_REUNIONS, m.id, { "Relance ODJ envoyée": true }); } catch (e) {}
    }

    // 5) Séances passées non pointées → une seule relance par équipe et par jour.
    //    J+1 et J+2 : staff de l'équipe ; à partir de J+3 : + directeur sportif.
    let pointage = 0;
    try { pointage = await relancePointages(users); } catch (e) { /* tables pas encore créées : on ignore */ }

    res.status(200).json({ ok: true, invitations_envoyees: invit, signatures_relancees: sign, presences_relancees: rsvp, odj_relances: odj, pointages_relances: pointage });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
}
