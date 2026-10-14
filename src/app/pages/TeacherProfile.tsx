import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Loader2, UserX } from "lucide-react";
import { EmptyState, InlineAlert, Page, PageHeader, Panel, ProgressBar, StatusPill } from "../components/ds/primitives";
import { useCurrentUser } from "../hooks/useCurrentUser";
import { API_BASE, apiFetch as fetch } from "../config/api";
import { notify } from "../lib/notify";

const API_BASE_URL = API_BASE;

type PerfilPayload = {
  id: number;
  nombre: string;
  apellido: string;
  correo: string;
  rol: string;
  tipo_docente: string | null;
  regional: string | null;
  link_drive: string | null;
  programa: { id: number | null; nombre: string };
  escuela: { id: number | null; nombre: string };
  grupo_matriz: {
    id: number;
    nombre: string;
    horas_totales: number | null;
    num_proyectos: number;
    num_actividades: number;
    num_convenios_nuevos: number;
    num_convenios_dinamizados: number;
  } | null;
  stats: {
    total_plantillas: number;
    completados: number;
    porcentaje_avance: number;
  };
};

function tipoIsNuevo(t: string | null | undefined) {
  return String(t ?? "").toUpperCase() === "NUEVO";
}

function Dato({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-text-subtle">{label}</dt>
      <dd className="mt-0.5 text-sm text-text">{children}</dd>
    </div>
  );
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
      const res = await fetch(`${API_BASE_URL}/docente/${userId}/perfil`);
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

  useEffect(() => {
    void load();
  }, [load]);

  const saveDrive = async () => {
    if (!userId) return;
    setSavingDrive(true);
    try {
      const res = await fetch(`${API_BASE_URL}/docente/${userId}/info-contacto`, {
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

  if (!userId) {
    return (
      <Page>
        <Panel>
          <EmptyState icon={UserX} title="Inicia sesión para ver tu perfil" />
        </Panel>
      </Page>
    );
  }

  if (loading) {
    return (
      <Page>
        <div className="mx-auto max-w-3xl space-y-4 animate-pulse" role="status" aria-label="Cargando perfil">
          <div className="h-8 w-1/3 rounded-lg bg-gray-100" />
          <div className="h-28 rounded-xl bg-gray-100" />
          <div className="h-24 rounded-xl bg-gray-100" />
          <div className="h-28 rounded-xl bg-gray-100" />
        </div>
      </Page>
    );
  }

  if (!perfil) {
    return (
      <Page>
        <div className="mx-auto max-w-3xl">
          {loadFailed ? (
            <InlineAlert action={<button type="button" onClick={() => void load()} className="ds-btn ds-btn-secondary ds-btn-sm">Reintentar</button>}>
              No se pudo cargar el perfil.
            </InlineAlert>
          ) : (
            <Panel>
              <EmptyState icon={UserX} title="Perfil no disponible" />
            </Panel>
          )}
        </div>
      </Page>
    );
  }

  const iniciales =
    `${(perfil.nombre || "?")[0] || ""}${(perfil.apellido || "?")[0] || ""}`.toUpperCase();
  const nuevo = tipoIsNuevo(perfil.tipo_docente);
  const pct = Math.min(100, Math.max(0, perfil.stats.porcentaje_avance));
  const driveCambiado = driveLink.trim() !== (perfil.link_drive || "").trim();

  return (
    <Page>
      <div className="mx-auto w-full max-w-3xl space-y-5">
        <PageHeader title="Mi perfil" description="Tus datos académicos, tu carga y tu avance del semestre." />

        <Panel>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand text-lg text-white"
              style={{ fontWeight: 650 }}
              aria-hidden
            >
              {iniciales}
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-lg">{perfil.nombre} {perfil.apellido}</h2>
              <p className="truncate text-sm text-text-muted">{perfil.correo}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <StatusPill tone="neutral" dot={false}>Docente de proyección social</StatusPill>
                <StatusPill tone={nuevo ? "brand" : "neutral"} dot={false}>Tipo: {nuevo ? "Nuevo" : "Antiguo"}</StatusPill>
                <span className="text-xs text-text-subtle">Regional: {perfil.regional || "—"}</span>
              </div>
            </div>
          </div>
        </Panel>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <Panel title="Información académica">
            <dl className="space-y-3">
              <Dato label="Escuela">{perfil.escuela.nombre}</Dato>
              <Dato label="Programa">{perfil.programa.nombre}</Dato>
            </dl>
          </Panel>

          <Panel title="Grupo y carga">
            {perfil.grupo_matriz ? (
              <div className="space-y-3">
                <dl className="grid grid-cols-2 gap-3">
                  <Dato label="Grupo">{perfil.grupo_matriz.nombre}</Dato>
                  <Dato label="Horas totales">{perfil.grupo_matriz.horas_totales ?? "—"}</Dato>
                </dl>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    ["Proyectos", perfil.grupo_matriz.num_proyectos],
                    ["Actividades", perfil.grupo_matriz.num_actividades],
                    ["Conv. nuevos", perfil.grupo_matriz.num_convenios_nuevos],
                    ["Conv. dinamizados", perfil.grupo_matriz.num_convenios_dinamizados],
                  ].map(([label, n]) => (
                    <StatusPill key={String(label)} dot={false}>
                      <span className="tabular-nums">{n}</span> {label}
                    </StatusPill>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-text-muted">Sin grupo matriz asignado.</p>
            )}
          </Panel>
        </div>

        <Panel title="Avance semestral">
          <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-sm text-text-muted">
                {perfil.stats.completados} de {perfil.stats.total_plantillas} entregables completados
              </p>
              <p className="text-lg tabular-nums" style={{ fontWeight: 650 }}>{pct}%</p>
            </div>
            <ProgressBar value={pct} tone="brand" label="Avance semestral" />
          </div>
        </Panel>

        <Panel title="Tu enlace de Drive" description="Carpeta donde reúnes las evidencias de tus entregables.">
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              void saveDrive();
            }}
          >
            <label htmlFor="perfil-drive" className="ds-label">Enlace de Drive</label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                id="perfil-drive"
                type="url"
                className="ds-input flex-1"
                value={driveLink}
                onChange={(e) => setDriveLink(e.target.value)}
                placeholder="https://drive.google.com/…"
              />
              {driveLink.trim() && (
                <a href={driveLink} target="_blank" rel="noopener noreferrer" className="ds-btn ds-btn-secondary" aria-label="Abrir enlace de Drive en una pestaña nueva">
                  <ExternalLink className="h-4 w-4" aria-hidden /> Abrir
                </a>
              )}
              <button type="submit" disabled={savingDrive || !driveCambiado} className="ds-btn ds-btn-primary">
                {savingDrive && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                Guardar
              </button>
            </div>
          </form>
        </Panel>
      </div>
    </Page>
  );
}
