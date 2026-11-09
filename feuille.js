// Lecture d'une feuille de match FFHB (PDF exporté de la table de marque).
// readFeuille(file) → objet « feuille » prêt à importer ; parseFeuille(pages) fait le travail sur le texte positionné.
// pages = [[{ s, x, y, w }]] : chaque morceau de texte avec sa position (x à gauche, y vers le haut, largeur w).

const COLS = ["Buts", "7m", "Tirs", "Arrets", "Av.", "2'", "Dis"];
const ACTIONS = "But 7m|Tir 7m|Arrêt 7m|But|Tir|Arrêt|Avertissement|2\\s?MN|Disqualification|Temps mort";
const num = (v) => (/^\d+$/.test(v || "") ? Number(v) : 0);

function linesOf(items) {
  const sorted = [...items].filter((it) => String(it.s).trim()).sort((a, b) => b.y - a.y || a.x - b.x);
  const lines = [];
  for (const it of sorted) {
    const l = lines.find((L) => Math.abs(L.y - it.y) < 2.5);
    if (l) l.items.push(it); else lines.push({ y: it.y, items: [it] });
  }
  for (const l of lines) { l.items.sort((a, b) => a.x - b.x); l.text = l.items.map((i) => String(i.s).trim()).join("  "); }
  return lines;
}

export function parseFeuille(pages) {
  const all = pages.map(linesOf);
  const flat = all.flat();
  const full = flat.map((l) => l.text).join("\n");
  const one = full.replace(/\s+/g, " ");
  const p1 = all[0] || [];
  // Titre : « RECEVANT / VISITEUR » suivi des deux scores.
  const tl = p1.find((l) => / \/ /.test(l.text) && (l.items.filter((i) => /^\d+$/.test(String(i.s).trim())).length >= 2));
  if (!tl) throw new Error("Ce PDF ne ressemble pas à une feuille de match FFHB (titre introuvable).");
  const nums = tl.items.filter((i) => /^\d+$/.test(String(i.s).trim())).map((i) => Number(String(i.s).trim()));
  const names = tl.items.map((i) => String(i.s).trim()).filter((s) => / \/ /.test(s))[0] || tl.text;
  const [home, away] = names.split(" / ").map((s) => s.replace(/\s{2,}.*/, "").trim());
  const dm = one.match(/(\d\d)\/(\d\d)\/(\d{4}) (\d\d:\d\d)/);
  const out = {
    home, away, score: [nums[nums.length - 2], nums[nums.length - 1]],
    date: dm ? dm[3] + "-" + dm[2] + "-" + dm[1] : null, heure: dm ? dm[4] : null,
    journee: (one.match(/Journée (J\d+)/) || [])[1] || "", code: (one.match(/Code Renc (\w+)/) || [])[1] || "",
    competition: ((one.match(/Compétition (.+?) (?:Groupe|POULE)/) || [])[1] || "").trim(),
    salle: ((one.match(/Salle (.+?) (?:Chronom|\d)/) || [])[1] || "").trim(),
    half: null, teams: [], goals: [], excl: [], timeouts: [],
  };
  // Tableaux joueurs : une ligne d'en-tête « Capt N° … Buts 7m Tirs … » par équipe.
  let cur = null;
  for (const l of flat) {
    if (l.items.some((i) => String(i.s).trim() === "Buts") && l.items.some((i) => String(i.s).trim() === "Tirs")) {
      const cols = {};
      for (const c of COLS) { const it = l.items.find((i) => String(i.s).trim() === c); if (it) cols[c] = it.x + (it.w || 0) / 2; }
      if (cols["7m"] == null) { const it = l.items.find((i) => /^7\s*m?$/.test(String(i.s).trim())); cols["7m"] = it ? it.x + (it.w || 0) / 2 + 3 : (cols["Buts"] + cols["Tirs"]) / 2; }
      cur = { cols, players: [], officials: [] }; out.teams.push(cur); continue;
    }
    if (!cur) continue;
    if (/Détail score|Déroulé du match|Période 1/.test(l.text)) { cur = null; continue; }
    const li = l.items.findIndex((i) => /^\d{13}$/.test(String(i.s).trim()));
    if (li < 0) continue;
    const licence = String(l.items[li].s).trim();
    const before = l.items.slice(0, li).map((i) => String(i.s).trim());
    const after = l.items.slice(li + 1);
    const vals = {};
    for (const it of after.slice(1)) { // le 1er élément après la licence est le type (A, B…)
      const s = String(it.s).trim(); const c = it.x + (it.w || 0) / 2;
      let best = null, d = 1e9; for (const k of Object.keys(cur.cols)) { const dd = Math.abs(cur.cols[k] - c); if (dd < d) { d = dd; best = k; } }
      if (best && d < 16) vals[best] = s;
    }
    // Avant la licence : [étiquettes verticales…] [X capitaine] N° NOM Prénom — on lit depuis la licence vers la gauche.
    const offI = before.findIndex((t) => /^Officiel Resp/.test(t));
    if (offI >= 0) { const role = (before[offI].match(/Resp\.?\s*([A-D])/) || [])[1] || ""; cur.officials.push({ role, nom: (before[before.length - 1] || "").trim(), licence }); continue; }
    const nomP = (before[before.length - 1] || "").replace(/\s+/g, " ").trim(), nP = before[before.length - 2], cP = before[before.length - 3];
    if (!/^\d{1,3}$/.test(nP || "") || !nomP) continue;
    cur.players.push({ num: Number(nP), capt: cP === "X", nom: nomP, licence,
      buts: num(vals["Buts"]), b7: num(vals["7m"]), tirs: num(vals["Tirs"]), arrets: num(vals["Arrets"]),
      av: vals["Av."] ? 1 : 0, m2: num(vals["2'"]), dis: vals["Dis"] ? 1 : 0 });
  }
  if (out.teams.length < 2) throw new Error("Tableaux des joueurs introuvables dans ce PDF.");
  // Score à la mi-temps : premiers nombres sous « Période 1 ».
  const pi = flat.findIndex((l) => /Période 1/.test(l.text) && /Fin/.test(l.text));
  if (pi >= 0) { const n = flat.slice(pi + 1, pi + 4).flatMap((l) => l.items.map((i) => String(i.s).trim())).filter((s) => /^\d+$/.test(s)).map(Number); if (n.length >= 2) out.half = [n[0], n[1]]; }
  // Déroulé : buts (pour la courbe du score), exclusions, temps morts. Score noté « recevant - visiteur ».
  const re = new RegExp("(\\d{2}):(\\d{2})\\s+(\\d+)\\s*-\\s*(\\d+)\\s+(" + ACTIONS + ")(?:\\s+(.+?))?(?=\\s+\\d{2}:\\d{2}\\s+\\d+\\s*-|$)", "g");
  const homeNames = new Set(out.teams[0].players.map((p) => p.nom)), awayNames = new Set(out.teams[1].players.map((p) => p.nom));
  const seen = new Set();
  for (const l of flat) {
    const t = l.text.replace(/\s+/g, " ");
    let m; re.lastIndex = 0;
    while ((m = re.exec(t))) {
      const sec = Number(m[1]) * 60 + Number(m[2]), h = Number(m[3]), a = Number(m[4]), act = m[5].replace(/\s/g, "") === "2MN" ? "2MN" : m[5], who = (m[6] || "").trim();
      const key = sec + "|" + h + "|" + a + "|" + act + "|" + who; if (seen.has(key)) continue; seen.add(key);
      if (act === "But" || act === "But 7m") out.goals.push([sec, h, a]);
      else if (act === "2MN" || act === "Disqualification") out.excl.push([sec, homeNames.has(who) ? "H" : awayNames.has(who) ? "A" : "?", who, act === "2MN" ? "2'" : "D"]);
      else if (act === "Temps mort" && /Recevant|Visiteur/.test(who)) out.timeouts.push([sec, /Recevant/.test(who) ? "H" : "A"]);
    }
  }
  out.goals.sort((x, y) => x[0] - y[0] || x[1] + x[2] - (y[1] + y[2]));
  // On ne garde que les buts qui font avancer le score d'un but (élimine les lignes parasites).
  { let ph = 0, pa = 0; out.goals = out.goals.filter(([, h, a]) => { if (h + a === ph + pa + 1 && h >= ph && a >= pa) { ph = h; pa = a; return true; } return false; }); }
  const lg = out.goals[out.goals.length - 1];
  if (!lg || lg[1] !== out.score[0] || lg[2] !== out.score[1]) out.goals.push([3600, out.score[0], out.score[1]]);
  out.excl.sort((x, y) => x[0] - y[0]); out.timeouts.sort((x, y) => x[0] - y[0]);
  out.teams = out.teams.slice(0, 2).map((t) => ({ players: t.players, officials: t.officials }));
  return out;
}

// Lit le fichier PDF dans le navigateur (pdf.js chargé seulement à ce moment-là).
export async function readFeuille(file) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const worker = (await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const pg = await doc.getPage(i); const tc = await pg.getTextContent();
    pages.push(tc.items.filter((it) => it.str && it.str.trim()).map((it) => ({ s: it.str, x: it.transform[4], y: it.transform[5], w: it.width })));
  }
  return parseFeuille(pages);
}

// --- Correspondance joueurs de la feuille ↔ joueurs de l'appli ---
export const normTxt = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z]/g, "");
function lev(a, b) { const d = Array.from({ length: b.length + 1 }, (_, i) => i); for (let i = 1; i <= a.length; i++) { let p = d[0]; d[0] = i; for (let j = 1; j <= b.length; j++) { const t = d[j]; d[j] = Math.min(d[j] + 1, d[j - 1] + 1, p + (a[i - 1] !== b[j - 1] ? 1 : 0)); p = t; } } return d[b.length]; }
// Sur la feuille : « NOM Prénom » (nom en majuscules). players = [{ id, nom, prenom, licence }]
export function matchPlayer(sheetP, players) {
  const parts = sheetP.nom.split(" ");
  const up = parts.filter((p) => p === p.toUpperCase() && /[A-Z]/.test(p)), first = parts.filter((p) => !(p === p.toUpperCase() && /[A-Z]/.test(p)));
  const ln = normTxt(up.join("")), fn = normTxt(first.join(""));
  const byLic = players.find((p) => p.licence && String(p.licence).replace(/\D/g, "") === sheetP.licence);
  if (byLic) return { id: byLic.id, how: "licence" };
  const ex = players.filter((p) => normTxt(p.nom) === ln);
  if (ex.length === 1) return { id: ex[0].id, how: "nom" };
  if (ex.length > 1) { const e2 = ex.filter((p) => normTxt(p.prenom).slice(0, 2) === fn.slice(0, 2)); if (e2.length === 1) return { id: e2[0].id, how: "nom" }; }
  const fz = players.filter((p) => lev(normTxt(p.nom), ln) <= 2 && normTxt(p.prenom).slice(0, 2) === fn.slice(0, 2));
  if (fz.length === 1) return { id: fz[0].id, how: "approché" };
  return { id: null, how: "inconnu" };
}
export const isUs = (name) => /VITROLLES/i.test(name || "");

export const capName = (s) => String(s || "").toLowerCase().replace(/(^|[\s'-])\p{L}/gu, (m) => m.toUpperCase());
// Construit l'objet stocké (point de vue VHB) à partir de la feuille lue et de la correspondance des joueurs.
export function buildStored(r, usIdx, ids, advShort) {
  const us = r.teams[usIdx].players, th = r.teams[1 - usIdx].players;
  const flip = usIdx === 1;
  const sum = (arr, k) => arr.reduce((a, p) => a + (p[k] || 0), 0);
  return {
    v: 1, j: r.journee, date: r.date, heure: r.heure, comp: r.competition, salle: r.salle, code: r.code,
    dom: usIdx === 0, adv: advShort || capName(usIdx === 0 ? r.away : r.home), advFull: capName(usIdx === 0 ? r.away : r.home),
    s: flip ? [r.score[1], r.score[0]] : [r.score[0], r.score[1]],
    mt: r.half ? (flip ? [r.half[1], r.half[0]] : [r.half[0], r.half[1]]) : null,
    us: us.map((p, i) => ({ id: ids[i] || null, n: p.nom, num: p.num, lic: p.licence, c: p.capt ? 1 : 0, b: p.buts, b7: p.b7, t: p.tirs, ar: p.arrets, av: p.av, m2: p.m2, d: p.dis })),
    them: { b: sum(th, "buts"), b7: sum(th, "b7"), t: sum(th, "tirs"), ar: sum(th, "arrets"), m2: sum(th, "m2"), av: sum(th, "av"), d: sum(th, "dis"),
      top: [...th].sort((a, b) => b.buts - a.buts).slice(0, 3).filter((p) => p.buts).map((p) => [p.nom, p.buts]),
      gk: th.filter((p) => p.arrets).map((p) => [p.nom, p.arrets]) },
    goals: r.goals.map(([t, h, a]) => flip ? [t, a, h] : [t, h, a]),
    excl: r.excl.map(([t, side, n, k]) => [t, side === "?" ? "?" : (side === "H") === !flip ? "V" : "A", n, k]),
    to: r.timeouts.map(([t, side]) => [t, (side === "H") === !flip ? "V" : "A"]),
  };
}

