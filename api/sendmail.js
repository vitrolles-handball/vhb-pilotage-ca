// Envoi d'e-mails côté serveur via Resend. La clé (RESEND_API_KEY) reste ici — jamais exposée au navigateur.
// MAIL_FROM (facultatif) : expéditeur vérifié, ex. "VHB Pilotage <pilotage@vitrolleshandball.com>".
// Tant que la clé n'est pas configurée dans Vercel, la fonction répond proprement sans rien envoyer.
const KEY = process.env.RESEND_API_KEY;
const FROM = process.env.MAIL_FROM || "VHB Pilotage <onboarding@resend.dev>";

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "POST uniquement" }); return; }
  if (!KEY) { res.status(500).json({ error: "RESEND_API_KEY manquante — e-mail non configuré pour l'instant." }); return; }
  let b = req.body;
  if (typeof b === "string") { try { b = JSON.parse(b); } catch (e) { b = {}; } }
  const { to, subject, html } = b || {};
  if (!to || !subject) { res.status(400).json({ error: "Champs requis : to, subject." }); return; }
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: "Bearer " + KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to: Array.isArray(to) ? to : [to], subject, html: html || "" }),
    });
    const text = await r.text();
    if (!r.ok) throw new Error("Resend " + r.status + " : " + text);
    res.status(200).json(JSON.parse(text || "{}"));
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
}
