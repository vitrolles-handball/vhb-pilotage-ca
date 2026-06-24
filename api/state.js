const TABLE = "Pôles";
const FIELD_ID = "Identifiant";
const FIELD_DATA = "Données";

const apiUrl = (baseId) =>
  "https://api.airtable.com/v0/" + baseId + "/" + encodeURIComponent(TABLE);

async function fetchAll(baseId, token) {
  const records = [];
  let offset;
  do {
    const url = new URL(apiUrl(baseId));
    url.searchParams.set("pageSize", "100");
    if (offset) url.searchParams.set("offset", offset);
    const res = await fetch(url, { headers: { Authorization: "Bearer " + token } });
    if (!res.ok) throw new Error("Airtable GET " + res.status + " " + (await res.text()));
    const j = await res.json();
    records.push(...j.records);
    offset = j.offset;
  } while (offset);
  return records;
}

export default async function handler(req, res) {
  const token = process.env.AIRTABLE_TOKEN;
  const baseId = process.env.AIRTABLE_BASE_ID;
  if (!token || !baseId) {
    res.status(500).json({ error: "Configuration manquante (AIRTABLE_TOKEN / AIRTABLE_BASE_ID)." });
    return;
  }
  try {
    if (req.method === "GET") {
      const records = await fetchAll(baseId, token);
      const data = {};
      for (const rec of records) {
        const id = rec.fields[FIELD_ID];
        if (!id) continue;
        const raw = rec.fields[FIELD_DATA];
        let val = { avance: "", bloque: "", besoin: "", odj: [], extra: [] };
        if (raw) { try { val = JSON.parse(raw); } catch (e) {} }
        data[id] = val;
      }
      res.status(200).json(data);
      return;
    }
    if (req.method === "POST") {
      let body = req.body;
      if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = {}; } }
      const records = await fetchAll(baseId, token);
      const idToRec = {};
      for (const rec of records) {
        const id = rec.fields[FIELD_ID];
        if (id) idToRec[id] = rec.id;
      }
      const updates = [];
      for (const id of Object.keys(body || {})) {
        const recId = idToRec[id];
        if (!recId) continue;
        updates.push({ id: recId, fields: { [FIELD_DATA]: JSON.stringify(body[id]) } });
      }
      for (let i = 0; i < updates.length; i += 10) {
        const chunk = updates.slice(i, i + 10);
        const r = await fetch(apiUrl(baseId), {
          method: "PATCH",
          headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
          body: JSON.stringify({ records: chunk }),
        });
        if (!r.ok) throw new Error("Airtable PATCH " + r.status + " " + (await r.text()));
      }
      res.status(200).json({ ok: true, updated: updates.length });
      return;
    }
    res.status(405).json({ error: "Méthode non supportée" });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
}
