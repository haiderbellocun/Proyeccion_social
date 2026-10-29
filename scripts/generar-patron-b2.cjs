// Genera src/app/components/b2/patron-b2.svg: la celda repetible (96,26 × 55,54 u) del patrón geométrico de referencia (rombos y nodos hexagonales).
// Lee la geometría vectorial EXACTA del .eps original (Adobe Illustrator, 288 × 288 u): los trazos ya vienen contorneados, sin aproximaciones.
//   node scripts/generar-patron-b2.cjs "C:\ruta\7474.eps"
// La celda es el periodo de la red: 2 columnas de nodos (2 × 48,13 u) × 1 fila (55,54 u). Se recorta en el medio de dos columnas, de modo que al repetirla
// (background/mask-repeat) las piezas cortadas encajan y la malla es continua. El color NO va en el SVG: es una máscara (ver --b2-patron-* en b2.css).
const fs = require("fs");
const path = require("path");
const eps = process.argv[2];
if (!eps) { console.error("Uso: node scripts/generar-patron-b2.cjs <archivo.eps>"); process.exit(2); }
const lineas = fs.readFileSync(eps, "latin1").replace(/\r/g, "").split("\n");
// El primer subtrazado es el rectángulo blanco de fondo (4 «li»); el patrón empieza después del primer «f».
const ini = lineas.findIndex((l) => l === "f") + 1;
const fin = lineas.findIndex((l, i) => i > ini && l === "ef");
const subs = [];
let cur = null;
for (const raw of lineas.slice(ini, fin)) {
  const t = raw.trim().split(/\s+/);
  const op = t[t.length - 1];
  const n = t.slice(0, -1).map(Number);
  if (op === "mo") { cur = []; subs.push(cur); cur.push(["M", n[0], 288 - n[1]]); }
  else if (op === "li" && cur) cur.push(["L", n[0], 288 - n[1]]);
  else if (op === "cv" && cur) cur.push(["C", n[0], 288 - n[1], n[2], 288 - n[3], n[4], 288 - n[5]]);
  else if (op === "cp" && cur) cur.push(["Z"]);
}
const X0 = 39.91, Y0 = 32.86, W = 96.26, H = 55.54;
const r = (v) => +v.toFixed(2);
let d = "";
for (const s of subs) {
  const xs = [], ys = [];
  for (const c of s) for (let k = 1; k < c.length; k += 2) { xs.push(c[k]); ys.push(c[k + 1]); }
  if (Math.max(...xs) < X0 || Math.min(...xs) > X0 + W || Math.max(...ys) < Y0 || Math.min(...ys) > Y0 + H) continue;
  let px = 0, py = 0;
  for (const c of s) {
    if (c[0] === "Z") { d += "z"; continue; }
    const p = c.slice(1).map((v, k) => v - (k % 2 ? Y0 : X0));
    if (c[0] === "M") { d += `M${r(p[0])} ${r(p[1])}`; px = p[0]; py = p[1]; }
    else if (c[0] === "L") { d += `l${r(p[0] - px)} ${r(p[1] - py)}`; px = p[0]; py = p[1]; }
    else { d += `c${r(p[0] - px)} ${r(p[1] - py)} ${r(p[2] - px)} ${r(p[3] - py)} ${r(p[4] - px)} ${r(p[5] - py)}`; px = p[4]; py = p[5]; }
  }
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><path d="${d}"/></svg>\n`;
const out = path.join(__dirname, "..", "src", "app", "components", "b2", "patron-b2.svg");
fs.writeFileSync(out, svg);
console.log(`${out}: ${svg.length} bytes`);
