// Capturas de Administración B2 (solo lectura: abre listas, inspectores y formularios sin guardar nada).
// Uso: npm run e2e -- capturas-administracion            → escribe en E2E_OUT (def. e2e/salida/)
//      node e2e/suites/capturas-administracion.mjs <carpeta>   → p. ej. docs/b2-integracion/etapa4c
import fs from "node:fs";
import path from "node:path";
import { lanzar, pausa, iniciarSuite, guardaBD, login, ir, E, linea, OUT, RAIZ, ADMIN } from "../lib/helpers.mjs";
iniciarSuite("capturas-administracion");
const { pool, q } = await guardaBD();
const destino = process.argv[2] ? path.resolve(RAIZ, process.argv[2]) : OUT;
fs.mkdirSync(destino, { recursive: true });
const res = [];
const ok = (n, c, d = "") => res.push(linea(n, c, d));

const clic = (p, txt, ambito = "document") => E(p, `const b=[...${ambito}.querySelectorAll('button,a')].find(x=>x.offsetParent!==null&&!x.disabled&&(x.getAttribute('aria-label')||x.textContent).trim()===${JSON.stringify(txt)}); if(!b) return false; b.click(); return true`);
const abrir = async (p, tab, extra = "") => { await ir(p, `/admin/sistema?tab=${tab}${extra}`, 1500); await p.esperar("!document.querySelector('.b2-skel')", { ms: 10000, etiqueta: "fin de carga" }).catch(() => {}); await pausa(1200); };
const primeraFila = (p, i = 0) => E(p, `const r=document.querySelectorAll('.b2-ml-i, .b2-tabla-r')[${i}]; if(!r) return false; r.click(); return true`);
const foto = async (p, nombre) => { await pausa(700); await p.foto(path.join(destino, `${nombre}.png`)); ok(`captura ${nombre}`, fs.existsSync(path.join(destino, `${nombre}.png`)) && await E(p, "return document.documentElement.scrollWidth <= innerWidth + 2")); };

const p = await lanzar({ ancho: 1440, alto: 900 });
try {
  const sem = (await q("select codigo from semestres where activo"))[0].codigo;
  const grupo = (await q("select id from grupos_matriz where semestre=$1 order by id limit 1", [sem]))[0].id;
  await login(p, ADMIN);
  const extraPl = `&semestre=${sem}&grupo=${grupo}`;

  /* ── 1440: cada pestaña con una fila seleccionada y su inspector ── */
  await p.tamano(1440, 900);
  for (const [tab, nombre, extra, fila] of [["usuarios", "usuarios", "", 0], ["semestres", "semestres", "", 0], ["programas", "programas", "", 0], ["proyectos", "iniciativas", "", 0], ["tareas", "tareas", "", 0], ["plantillas", "plantillas", extraPl, 1]]) {
    await abrir(p, tab, extra); await primeraFila(p, fila); await foto(p, `${nombre}-1440`);
  }
  /* ── 1440: formularios abiertos (sin guardar) ── */
  await abrir(p, "usuarios"); await clic(p, "Agregar usuario"); await foto(p, "usuarios-form-1440");
  await abrir(p, "semestres"); await clic(p, "Nuevo semestre"); await foto(p, "semestres-form-1440");
  await abrir(p, "programas"); await clic(p, "Nueva escuela"); await foto(p, "programas-form-1440");
  await abrir(p, "proyectos"); await clic(p, "Nueva iniciativa"); await foto(p, "iniciativas-form-1440");
  await abrir(p, "tareas"); await clic(p, "Clonar semestre", "document.querySelector('.b2-mx-acc')"); await foto(p, "tareas-clonar-1440");
  await abrir(p, "plantillas", extraPl); await clic(p, "Nueva plantilla"); await foto(p, "plantillas-form-1440");
  await abrir(p, "plantillas", extraPl); await primeraFila(p, 1); await pausa(400); await clic(p, "Actualizar evidencia compartida"); await pausa(1400); await foto(p, "plantillas-masiva-1440");

  /* ── 1280 y 820 ── */
  for (const w of [1280, 820]) {
    await p.tamano(w, w === 820 ? 1000 : 800);
    await abrir(p, "usuarios"); await primeraFila(p); await foto(p, `usuarios-${w}`);
    await abrir(p, "plantillas", extraPl); await primeraFila(p, 1); await foto(p, `plantillas-${w}`);
  }

  /* ── 390: listas, inspector y formulario ── */
  await p.tamano(390, 844);
  for (const [tab, nombre, extra] of [["usuarios", "usuarios", ""], ["semestres", "semestres", ""], ["programas", "programas", ""], ["proyectos", "iniciativas", ""], ["tareas", "tareas", ""], ["plantillas", "plantillas", extraPl]]) {
    await abrir(p, tab, extra); await foto(p, `${nombre}-390`);
  }
  await abrir(p, "usuarios"); await clic(p, "Agregar usuario"); await foto(p, "usuarios-form-390");
  await abrir(p, "proyectos"); await primeraFila(p); await foto(p, "iniciativas-inspector-390");
} finally {
  await p.cerrar();
  await pool.end();
  console.log(res.join("\n"));
  console.log(`Capturas en ${destino}`);
}
