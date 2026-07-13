// Envoi de notifications push (Web Push / VAPID). Clés secrètes en variables d'environnement Vercel.
import webpush from "web-push";

const BASE = process.env.AIRTABLE_BASE_ID;
const TOKEN = process.env.AIRTABLE_TOKEN;
const TABLE = "Utilisateurs";
const FIELD = "Push abonnements";

const recUrl = (recId) =>
  "https://api.airtable.com/v0/" + BASE + "/" + encodeURIComponent(TABLE) + "/" + recId;

async function getUser(recId) {
  const res = await fetch(recUrl(recId), { headers: { Authorization: "Bearer " + TOKEN } });
  if (!res.ok) return null;
  return res.json();
}
async function saveSubs(recId, list) {
  await fetch(recUrl(recId), {
    method: "PATCH",
    headers: { Authorization: "Bearer " + TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify({ fields: { [FIELD]: JSON.stringify(list) } }),
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "POST uniquement" }); return; }
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:direction@exya-formations.com";
  if (!TOKEN || !BASE || !pub || !priv) {
    res.status(500).json({ error: "Configuration manquante (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / Airtable)." });
    return;
  }
  webpush.setVapidDetails(subject, pub, priv);

  let b = req.body;
  if (typeof b === "string") { try { b = JSON.parse(b); } catch (e) { b = {}; } }
  const { userIds, title, body, url, badge } = b || {};
  if (!Array.isArray(userIds) || !userIds.length) { res.status(400).json({ error: "userIds requis" }); return; }

  const payload = JSON.stringify(Object.assign({ title: title || "VHB Pilotage", body: body || "", url: url || "/" }, typeof badge === "number" ? { badge } : {}));
  let sent = 0;
  try {
    for (const uid of userIds) {
      const rec = await getUser(uid);
      if (!rec) continue;
      let list = [];
      try { list = JSON.parse((rec.fields || {})[FIELD] || "[]"); } catch (e) { list = []; }
      if (!Array.isArray(list) || !list.length) continue;
      const keep = [];
      for (const sub of list) {
        try { await webpush.sendNotification(sub, payload); sent++; keep.push(sub); }
        catch (err) {
          const code = err && err.statusCode;
          if (code === 404 || code === 410) { /* abonnement expiré — on le retire */ }
          else keep.push(sub);
        }
      }
      if (keep.length !== list.length) { try { await saveSubs(uid, keep); } catch (e) {} }
    }
    res.status(200).json({ ok: true, sent });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
}
