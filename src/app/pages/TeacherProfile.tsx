// Mi perfil (docente) — diseño B2. Misma carga (GET /docente/:id/perfil) y misma acción de edición
// (PUT /docente/:id/info-contacto, solo el enlace de Drive). La versión anterior (Tinta) se conserva en TeacherProfileTinta.tsx.
import { useCallback, useEffect, useState } from "react";
import { useCurrentUser } from "../hooks/useCurrentUser";
import { API_BASE, apiFetch as fetch } from "../config/api";
import { notify } from "../lib/notify";
import { esHttp } from "../components/EnlaceEvidencia";
import { Bullet } from "../components/b2/Bullet";
import { Dl } from "../components/b2/ui";

type PerfilPayload = {
  id: number; nombre: string; apellido: string; correo: string; rol: string; tipo_docente: string | null; regional: string | null; link_drive: string | null;
  programa: { id: number | null; nombre: string };
  escuela: { id: number | null; nombre: string };
  grupo_matriz: { id: number; nombre: string; horas_totales: number | null; num_proyectos: number; num_actividades: number; num_convenios_nuevos: number; num_convenios_dinamizados: number } | null;
  stats: { total_plantillas: number; completados: number; porcentaje_avance: number };
};

function Contenedor({ children }: { children: React.ReactNode }) {
  return <div className="b2-vista b2-dash b2-scope"><div className="b2-vista-main" data-scroll><div className="b2-pg" style={{ maxWidth: 980 }}>{children}</div></div></div>;
}

export default function TeacherProfile() {
  const currentUser = useCurrentUser();
  const userId = currentUser?.id ?? null;
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [perfil, setPerfil] = useState<PerfilPayload | null>(null);
  const [driveLink, setDriveLink] = useState("");
  const [savingDrive, setSavingDrive] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setLoadFailed(false);
    try {
      const res = await fetch(`${API_BASE}/docente/${userId}/perfil`);
      if (!res.ok) throw new Error("perfil");
      const data = (await res.json()) as PerfilPayload;
      setPerfil(data);
      setDriveLink(data.link_drive || "");
    } catch (e) {
      console.error(e);
      notify.error("No se pudo cargar el perfil.");
      setPerfil(null);
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [userId]);
  useEffect(() => { void load(); }, [load]);

  const saveDrive = async () => {
    if (!userId) return;
    setSavingDrive(true);
    try {
      const res = await fetch(`${API_BASE}/docente/${userId}/info-contacto`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ link_drive: driveLink }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        notify.fromError(j, "No se pudo guardar.");
        return;
      }
      notify.success("Perfil actualizado");
      await load();
    } catch (e) {
      console.error(e);
      notify.error("Error de conexión al guardar.");
    } finally {
      setSavingDrive(false);
    }
  };

  if (!userId) return <Contenedor><section className="b2-card"><p className="b2-vacio">Inicia sesión para ver tu perfil.</p></section></Contenedor>;
  if (loading) return <Contenedor><section className="b2-card" aria-busy="true" aria-label="Cargando perfil"><div className="b2-skel-w">{[40, 90, 70, 80].map((w, i) => <span key={i} className="b2-skel" style={{ width: `${w}%` }} />)}</div></section></Contenedor>;
  if (!perfil) {
    return (
      <Contenedor>
        {loadFailed
          ? <div className="b2-alert" role="alert"><span>No se pudo cargar el perfil.</span><button type="button" className="b2-btn b2-btn-sm" onClick={() => void load()}>Reintentar</button></div>
          : <section className="b2-card"><p className="b2-vacio">Perfil no disponible.</p></section>}
      </Contenedor>
    );
  }

  const iniciales = `${(perfil.nombre || "?")[0] || ""}${(perfil.apellido || "?")[0] || ""}`.toUpperCase();
  const nuevo = String(perfil.tipo_docente ?? "").toUpperCase() === "NUEVO";
  const pct = Math.min(100, Math.max(0, perfil.stats.porcentaje_avance));
  const driveCambiado = driveLink.trim() !== (perfil.link_drive || "").trim();

  return (
    <Contenedor>
      <header className="b2-pg-h">
        <div><h1 className="b2-pg-t">Mi perfil</h1><p className="b2-pg-s">Tus datos académicos, tu carga y tu avance del semestre.</p></div>
      </header>

      <section className="b2-card">
        <div className="b2-perfil-id">
          <span className="b2-perfil-av" aria-hidden="true">{iniciales}</span>
          <div style={{ minWidth: 0 }}>
            <h2 className="b2-perfil-n">{perfil.nombre} {perfil.apellido}</h2>
            <p className="b2-sub" style={{ fontSize: "var(--fs-md)" }}>{perfil.correo}</p>
            <div className="b2-acc-fila" style={{ marginTop: 8 }}>
              <span className="b2-pill">Docente de proyección social</span>
              <span className="b2-pill" data-a={nuevo ? "crear" : undefined}>Tipo: {nuevo ? "Nuevo" : "Antiguo"}</span>
              <span className="b2-sub" style={{ whiteSpace: "normal" }}>Regional: {perfil.regional || "—"}</span>
            </div>
          </div>
        </div>
      </section>

      <div className="b2-pg-cols" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
        <section className="b2-card" aria-labelledby="pf-acad">
          <div className="b2-card-h"><h2 id="pf-acad">Información académica</h2></div>
          <div style={{ padding: "0 14px 14px" }}><Dl rows={[["Escuela", perfil.escuela.nombre], ["Programa", perfil.programa.nombre], ["Regional", perfil.regional || "—"]]} /></div>
        </section>
        <section className="b2-card" aria-labelledby="pf-grupo">
          <div className="b2-card-h"><h2 id="pf-grupo">Grupo y carga</h2></div>
          {perfil.grupo_matriz ? (
            <div style={{ padding: "0 14px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
              <Dl rows={[["Grupo", perfil.grupo_matriz.nombre], ["Horas totales", perfil.grupo_matriz.horas_totales != null ? `${perfil.grupo_matriz.horas_totales} h` : "—"]]} />
              <div className="b2-acc-fila">
                {([["Proyectos", perfil.grupo_matriz.num_proyectos], ["Actividades", perfil.grupo_matriz.num_actividades], ["Conv. nuevos", perfil.grupo_matriz.num_convenios_nuevos], ["Conv. dinamizados", perfil.grupo_matriz.num_convenios_dinamizados]] as [string, number][]).map(([l, n]) => <span key={l} className="b2-pill">{n} {l}</span>)}
              </div>
            </div>
          ) : <p className="b2-vacio">Sin grupo matriz asignado.</p>}
        </section>
      </div>

      <section className="b2-card" aria-labelledby="pf-av">
        <div className="b2-card-h"><h2 id="pf-av">Avance semestral</h2><span className="b2-card-n">{perfil.stats.completados} de {perfil.stats.total_plantillas} entregables completados</span></div>
        <div style={{ padding: "0 14px 14px" }}><Bullet rep={pct} nombre="Avance semestral" /></div>
      </section>

      <section className="b2-card" aria-labelledby="pf-drive">
        <div className="b2-card-h"><h2 id="pf-drive">Tu enlace de Drive</h2><span className="b2-card-n">Carpeta donde reúnes las evidencias de tus entregables</span></div>
        <form className="b2-imp-body" style={{ paddingTop: 4 }} onSubmit={(e) => { e.preventDefault(); void saveDrive(); }}>
          <div>
            <label htmlFor="perfil-drive" className="b2-label">Enlace de Drive</label>
            <div className="b2-acc-fila">
              <input id="perfil-drive" type="url" className="b2-input" style={{ flex: "1 1 280px", width: "auto" }} value={driveLink} onChange={(e) => setDriveLink(e.target.value)} placeholder="https://drive.google.com/…" />
              {driveLink.trim() && esHttp(driveLink.trim()) && <a href={driveLink} target="_blank" rel="noopener noreferrer" className="b2-btn" aria-label="Abrir enlace de Drive en una pestaña nueva">Abrir</a>}
              <button type="submit" className="b2-btn b2-btn-primary" disabled={savingDrive || !driveCambiado}>{savingDrive && <span className="b2-spin" aria-hidden="true" />}Guardar</button>
            </div>
          </div>
          <p className="b2-imp-help">Tus archivos permanecen en tu Drive; ProySocial solo guarda el enlace y la trazabilidad.</p>
        </form>
      </section>
    </Contenedor>
  );
}
