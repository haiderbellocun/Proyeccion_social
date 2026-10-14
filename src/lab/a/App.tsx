import { useEffect, useMemo, useRef, useState } from "react";
import { admin, diaMes, finSemestre, inicioSemestre, porSemana, semanaActual, semestre, totalSemanas } from "../shared/model";
import { Dashboard } from "./Dashboard";
import { Matriz } from "./Matriz";
import { Componentes } from "./Componentes";
import { Tip, ToastHost, toast } from "./ui";

type Vista = "panel" | "matriz" | "componentes";
const leerHash = (): Vista => {
  const h = window.location.hash.replace(/^#\/?/, "");
  return h === "matriz" || h === "componentes" ? h : "panel";
};

const NAV: { id: Vista | null; label: string; nota?: string }[] = [
  { id: "panel", label: "Panel" },
  { id: "matriz", label: "Matriz" },
  { id: null, label: "Revisión", nota: "Fuera del alcance del prototipo" },
  { id: null, label: "Avance", nota: "Fuera del alcance del prototipo" },
  { id: null, label: "Indicadores", nota: "Fuera del alcance del prototipo" },
  { id: null, label: "Importar", nota: "Fuera del alcance del prototipo" },
  { id: "componentes", label: "Componentes" },
];

/** Regla del semestre: 16 columnas; es resumen, navegación y gráfico a la vez. */
function Regla({ datos, titulo, onSemana }: { datos: { semana: number; rep: number; apr: number }[]; titulo: string; onSemana?: (s: number) => void }) {
  const max = Math.max(1, ...datos.map((d) => d.rep));
  const porSem = new Map(datos.map((d) => [d.semana, d]));
  return (
    <div className="regla">
      <div className="wrap">
        <div className="regla-t">
          Semestre {semestre}
          <span>{titulo}</span>
        </div>
        <div className="regla-g" role="list" aria-label="Semanas del semestre">
          {Array.from({ length: totalSemanas }, (_, i) => i + 1).map((s) => {
            const d = porSem.get(s);
            const futura = s > semanaActual;
            const texto = futura ? `Semana ${s}: aún no corresponde` : `Semana ${s}: ${d?.rep ?? 0} reportados, ${d?.apr ?? 0} aprobados`;
            return (
              <Tip key={s} texto={texto}>
                <button type="button" className="sem" role="listitem" data-ahora={s === semanaActual} data-futura={futura} aria-label={texto} onClick={() => onSemana?.(s)}>
                  <span className="col">
                    {!futura && <i style={{ height: `${((d?.rep ?? 0) / max) * 100}%` }} />}
                    {!futura && <i style={{ height: `${((d?.apr ?? 0) / max) * 100}%` }} />}
                  </span>
                  <span>{s}</span>
                </button>
              </Tip>
            );
          })}
        </div>
        <div className="regla-r">
          {diaMes(inicioSemestre)} – {diaMes(finSemestre)}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [vista, setVista] = useState<Vista>(leerHash);
  const [menuMovil, setMenuMovil] = useState(false);
  const [persona, setPersona] = useState(false);
  const personaRef = useRef<HTMLDivElement>(null);
  const [semanaPedida, setSemanaPedida] = useState<number | null>(null);

  useEffect(() => {
    const f = () => { setVista(leerHash()); setMenuMovil(false); window.scrollTo({ top: 0 }); };
    window.addEventListener("hashchange", f);
    return () => window.removeEventListener("hashchange", f);
  }, []);
  // Emil: las acciones de teclado no se animan; se detecta la última modalidad de entrada.
  useEffect(() => {
    const k = () => document.documentElement.setAttribute("data-teclado", "");
    const p = () => document.documentElement.removeAttribute("data-teclado");
    window.addEventListener("keydown", k);
    window.addEventListener("pointerdown", p);
    return () => { window.removeEventListener("keydown", k); window.removeEventListener("pointerdown", p); };
  }, []);
  useEffect(() => {
    document.title = `ProySocial · Gaceta · ${vista === "panel" ? "Panel" : vista === "matriz" ? "Matriz" : "Componentes"}`;
  }, [vista]);
  useEffect(() => {
    if (!persona) return;
    const abajo = (e: MouseEvent) => { if (!personaRef.current?.contains(e.target as Node)) setPersona(false); };
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") setPersona(false); };
    document.addEventListener("mousedown", abajo);
    document.addEventListener("keydown", tecla);
    return () => { document.removeEventListener("mousedown", abajo); document.removeEventListener("keydown", tecla); };
  }, [persona]);

  const datosRegla = useMemo(
    () =>
      vista === "matriz"
        ? porSemana.map((s) => ({ semana: s.semana, rep: s.reportados, apr: s.aprobados }))
        : admin.semanal.map((s: { semana: number; reportados: number; aprobados: number }) => ({ semana: s.semana, rep: s.reportados, apr: s.aprobados })),
    [vista]
  );

  return (
    <>
      <a className="skip" href="#contenido">Saltar al contenido</a>
      <header className="masthead">
        <div className="wrap">
          <a className="wordmark" href="#/panel" aria-label="ProySocial, ir al panel">
            ProySocial
            <small>Seguimiento de Proyección Social · CUN</small>
          </a>
          <button type="button" className="menu-toggle" aria-expanded={menuMovil} aria-controls="nav-principal" onClick={() => setMenuMovil((v) => !v)}>
            {menuMovil ? "Cerrar" : "Menú"}
          </button>
          <nav className="nav" id="nav-principal" data-open={menuMovil} aria-label="Principal">
            {NAV.map((n) =>
              n.id ? (
                <a key={n.label} href={`#/${n.id}`} aria-current={vista === n.id ? "page" : undefined}>{n.label}</a>
              ) : (
                <Tip key={n.label} texto={n.nota ?? ""}>
                  <a href="#/panel" aria-disabled="true" onClick={(e) => { e.preventDefault(); toast(n.nota ?? ""); }}>{n.label}</a>
                </Tip>
              )
            )}
          </nav>
          <div className="persona" ref={personaRef}>
            <button type="button" aria-expanded={persona} aria-haspopup="menu" onClick={() => setPersona((v) => !v)}>
              <span className="avatar" aria-hidden>AS</span>
              {vista === "matriz" ? "María R." : "Admin Sistema"}
            </button>
            {persona && (
              <div className="menu" role="menu">
                <header>
                  <b>Admin Sistema</b>
                  Administrador · coordinación
                </header>
                <button type="button" role="menuitem" onClick={() => { setPersona(false); toast("Perfil: fuera del alcance del prototipo"); }}>Mi perfil</button>
                <button type="button" role="menuitem" onClick={() => { setPersona(false); toast("Sesión cerrada (simulado)"); }}>Cerrar sesión</button>
              </div>
            )}
          </div>
        </div>
      </header>

      {vista !== "componentes" && (
        <Regla
          datos={datosRegla}
          titulo={vista === "matriz" ? "Entregables reportados y aprobados por semana" : "Reportados y aprobados por semana, todos los docentes"}
          onSemana={vista === "matriz" ? (s) => setSemanaPedida(s) : undefined}
        />
      )}

      <main id="contenido" tabIndex={-1}>
        {vista === "panel" && <Dashboard />}
        {vista === "matriz" && <Matriz semanaPedida={semanaPedida} onAtendida={() => setSemanaPedida(null)} />}
        {vista === "componentes" && <Componentes />}
      </main>

      <footer className="wrap pie">
        <span className="wordmark">ProySocial</span>
        <p>Prototipo de dirección visual · Concepto A «Gaceta». Datos sintéticos del entorno de desarrollo; no modifica nada del producto.</p>
      </footer>
      <ToastHost />
    </>
  );
}
