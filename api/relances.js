// Relance quotidienne des signataires (Président / Secrétaire) pour les comptes-rendus en attente.
// Déclenché par un Cron Vercel (voir vercel.json). Utilise les variables déjà présentes :
// AIRTABLE_TOKEN, AIRTABLE_BASE_ID, RESEND_API_KEY, MAIL_FROM.
const BASE = process.env.AIRTABLE_BASE_ID;
const TOKEN = process.env.AIRTABLE_TOKEN;
const KEY = process.env.RESEND_API_KEY;
const FROM = process.env.MAIL_FROM || "VHB Pilotage <onboarding@resend.dev>";
const APP = process.env.APP_URL || "https://vhb-pilotage-ca.vercel.app";

const T_REUNIONS = "tbl0i3NT6K1SjZHmz";
const T_UTILISATEURS = "tblyXO6nxbMSl2Qh5";

async function at(path) {
  const r = await fetch("https://api.airtable.com/v0/" + BASE + "/" + path, { headers: { Authorization: "Bearer " + TOKEN } });
  const t = await r.text();
  if (!r.ok) throw new Error("Airtable " + r.status + " : " + t);
  return JSON.parse(t);
}
async function sendMail(to, subject, html) {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: "Bearer " + KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to: [to], subject, html }),
  });
  if (!r.ok) throw new Error("Resend " + r.status + " : " + (await r.text()));
}
function frDate(s) {
  if (!s) return "";
  const d = String(s).slice(0, 10).split("-");
  return d.length === 3 ? d[2] + "/" + d[1] + "/" + d[0] : String(s);
}

export default async function handler(req, res) {
  if (!TOKEN || !BASE || !KEY) { res.status(500).json({ error: "Configuration manquante." }); return; }
  // Sécurité optionnelle : si CRON_SECRET est défini, on exige le header d'autorisation de Vercel Cron.
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers["authorization"] || "";
    if (auth !== "Bearer " + secret) { res.status(401).json({ error: "Unauthorized" }); return; }
  }
  try {
    const formula = encodeURIComponent("{Validation CR}='En attente de signature'");
    const reunions = await at(T_REUNIONS + "?filterByFormula=" + formula);
    const pending = reunions.records || [];
    if (!pending.length) { res.status(200).json({ ok: true, relances: 0, message: "Aucun compte-rendu en attente." }); return; }

    const usersRes = await at(T_UTILISATEURS + "?pageSize=100");
    const signataires = (usersRes.records || []).filter((u) => {
      const b = u.fields["Bureau"];
      return (b === "Président" || b === "Secrétaire") && u.fields["Email"];
    });
    if (!signataires.length) { res.status(200).json({ ok: true, relances: 0, message: "Aucun signataire (Président/Secrétaire) défini." }); return; }

    let count = 0;
    for (const m of pending) {
      const titre = m.fields["Titre"] || "Réunion du CA";
      const date = frDate(m.fields["Date"]);
      for (const u of signataires) {
        const prenom = u.fields["Prénom"] || "";
        const html = '<div style="font-family:Arial,Helvetica,sans-serif;color:#333;max-width:560px;margin:auto">'
          + '<div style="background:#16171B;padding:16px 20px;color:#fff;border-radius:12px 12px 0 0"><span style="font-weight:800;font-size:16px">VHB Pilotage</span> <span style="color:#F5C518;font-size:12px">Tous Hand\'semble</span></div>'
          + '<div style="border:1px solid #eee;border-top:none;padding:20px;border-radius:0 0 12px 12px">'
          + '<p>Bonjour ' + prenom + ',</p>'
          + '<p>Le compte-rendu de la réunion <b>' + titre + '</b>' + (date ? ' du <b>' + date + '</b>' : '') + ' est <b>en attente de ta signature</b>.</p>'
          + '<p>Merci de le relire et de le signer dès que possible.</p>'
          + '<p style="margin-top:16px"><a href="' + APP + '/?sign=' + m.id + '" style="background:#D62828;color:#fff;text-decoration:none;padding:11px 18px;border-radius:10px;font-weight:700;display:inline-block">Signer le compte-rendu en ligne</a></p>'
          + '</div>'
          + '<div style="color:#9aa0a6;font-size:11px;padding:10px 4px">Rappel automatique quotidien · Vitrolles Handball Jeunes</div>'
          + '</div>';
        try { await sendMail(u.fields["Email"], "Rappel : compte-rendu à signer — " + titre, html); count++; } catch (e) { /* on continue */ }
      }
    }
    res.status(200).json({ ok: true, reunions: pending.length, relances: count });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
}
