// Relances quotidiennes (Cron Vercel, voir vercel.json) :
//  1) Compte-rendus en attente de signature -> rappel aux signataires (Président/Secrétaire) qui n'ont pas signé.
//  2) Réunions à venir -> rappel de réponse (présent/absent) aux membres qui n'ont pas répondu.
// Utilise les variables déjà présentes : AIRTABLE_TOKEN, AIRTABLE_BASE_ID, RESEND_API_KEY, MAIL_FROM.
const BASE = process.env.AIRTABLE_BASE_ID;
const TOKEN = process.env.AIRTABLE_TOKEN;
const KEY = process.env.RESEND_API_KEY;
const FROM = process.env.MAIL_FROM || "VHB Pilotage <onboarding@resend.dev>";
const APP = process.env.APP_URL || "https://vhb-pilotage-ca.vercel.app";

const T_REUNIONS = "tbl0i3NT6K1SjZHmz";
const T_UTILISATEURS = "tblyXO6nxbMSl2Qh5";

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
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: "Bearer " + KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to: [to], subject, html }),
  });
  if (!r.ok) throw new Error("Resend " + r.status + " : " + (await r.text()));
}
function frDate(s) { if (!s) return ""; const d = String(s).slice(0, 10).split("-"); return d.length === 3 ? d[2] + "/" + d[1] + "/" + d[0] : String(s); }
function wrap(title, bodyHtml) {
  return '<div style="font-family:Arial,Helvetica,sans-serif;color:#333;max-width:560px;margin:auto">'
    + '<div style="background:#16171B;padding:16px 20px;color:#fff;border-radius:12px 12px 0 0"><span style="font-weight:800;font-size:16px">VHB Pilotage</span> <span style="color:#F5C518;font-size:12px">Tous Hand\'semble</span></div>'
    + '<div style="border:1px solid #eee;border-top:none;padding:20px;border-radius:0 0 12px 12px">' + (title ? '<h2 style="margin:0 0 12px;font-size:17px;color:#16171B">' + title + '</h2>' : '') + bodyHtml + '</div>'
    + '<div style="color:#9aa0a6;font-size:11px;padding:10px 4px">Rappel automatique · Vitrolles Handball Jeunes</div></div>';
}
const btn = (href, label, color) => '<a href="' + href + '" style="background:' + color + ';color:#fff;text-decoration:none;padding:11px 18px;border-radius:10px;font-weight:700;display:inline-block;margin:4px">' + label + '</a>';

export default async function handler(req, res) {
  if (!TOKEN || !BASE || !KEY) { res.status(500).json({ error: "Configuration manquante." }); return; }
  const secret = process.env.CRON_SECRET;
  if (secret) { const auth = req.headers["authorization"] || ""; if (auth !== "Bearer " + secret) { res.status(401).json({ error: "Unauthorized" }); return; } }
  try {
    const reunions = await at(T_REUNIONS);
    const users = await at(T_UTILISATEURS);
    const actifs = users.filter((u) => u.fields["Actif"] !== false && u.fields["Email"]);
    let sign = 0, rsvp = 0;

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
      if (m.fields["Statut"] === "Passée") continue;
      const titre = m.fields["Titre"] || "Réunion du CA";
      const rep = [].concat(m.fields["Répondu présent"] || [], m.fields["Répondu absent"] || []);
      for (const u of actifs) {
        if (rep.includes(u.id)) continue;
        const html = wrap("Réponds à l'invitation", '<p>Bonjour ' + (u.fields["Prénom"] || "") + ',</p><p>Une réunion du CA est prévue' + (m.fields["Date"] ? ' le <b>' + frDate(m.fields["Date"]) + '</b>' : '') + (m.fields["Heure"] ? ' à <b>' + m.fields["Heure"] + '</b>' : '') + '. Merci d\'indiquer si tu seras présent :</p><p style="margin-top:14px">' + btn(APP + "/?rsvp=" + m.id + "&r=present", "Je serai présent", "#2E8B57") + btn(APP + "/?rsvp=" + m.id + "&r=absent", "Je serai absent", "#D62828") + '</p>');
        try { await sendMail(u.fields["Email"], "Rappel : réponse attendue — " + titre, html); rsvp++; } catch (e) {}
      }
    }

    res.status(200).json({ ok: true, signatures_relancees: sign, presences_relancees: rsvp });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
}
