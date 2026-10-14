// Genera src/lab/data/dev-snapshot.json con datos SINTÉTICOS del entorno de desarrollo (base proysocial_dev, solo lectura).
// Uso (con el backend de desarrollo en :4000):  node src/lab/data/make-snapshot.mjs
import fs from "node:fs";

const API = process.env.API || "http://localhost:4000";
const login = async (correo) => {
  const r = await fetch(`${API}/auth/dev/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ correo }) });
  if (!r.ok) throw new Error(`login ${correo}: ${r.status}`);
  return r.json();
};
const get = async (token, ruta) => {
  const r = await fetch(`${API}${ruta}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`${ruta}: ${r.status}`);
  return r.json();
};

const admin = await login("admin@proysocial.local");
const maria = await login("maria.rodriguez@proysocial.local");
const mid = maria.user.id;

const snapshot = {
  generado: new Date().toISOString(),
  aviso: "Datos sintéticos de proysocial_dev. No contiene datos reales.",
  admin: {
    usuario: { nombre: admin.user.nombre, apellido: admin.user.apellido, rol: "admin" },
    dashboard: await get(admin.token, "/admin/dashboard"),
    revision: await get(admin.token, "/admin/reportes-revision?estado=todos&limit=100"),
  },
  docente: {
    usuario: { nombre: maria.user.nombre, apellido: maria.user.apellido, rol: "docente" },
    perfil: await get(maria.token, `/docente/${mid}/perfil`),
    matriz: await get(maria.token, `/docente/${mid}/matriz`),
    stats: await get(maria.token, `/docente/${mid}/matriz-stats`),
    dashboard: await get(maria.token, `/docente/${mid}/dashboard-stats`),
  },
};
fs.writeFileSync(new URL("./dev-snapshot.json", import.meta.url), JSON.stringify(snapshot));
console.log("items matriz:", snapshot.docente.matriz.items.length, "| docentes:", snapshot.admin.dashboard.docentes_recientes.length, "| revisión:", (snapshot.admin.revision.reportes || []).length);
