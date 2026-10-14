import { useNavigate, useParams } from "react-router";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  Link2,
  Clock,
  ExternalLink,
  FolderOpen,
} from "lucide-react";
import { EmptyState, Page, PageHeader, PageLoading, Panel, ProgressBar, Spinner, StatusPill, type Tone } from "../components/ds/primitives";
import { useCurrentUser } from "../hooks/useCurrentUser";
import { API_BASE, apiFetch as fetch } from "../config/api";
import { notify } from "../lib/notify";
import { formatDateOnly } from "../lib/date";

const API_BASE_URL = API_BASE;

type Entregable = {
  id: number;
  descripcion: string;
  horas: number | null;
  completado: boolean;
  fecha_completado: string | null;
  url_evidencia: string | null;
  fecha_real_entrega: string | null;
};

type Semana = {
  id: number;
  numero: number;
  fecha_inicio: string;
  fecha_fin: string;
  entregables: Entregable[];
};

type InitiativeDetail = {
  id: number;
  titulo: string;
  descripcion: string | null;
  tipo: string;
  estado: string;
  fechaInicio: string | null;
  fechaFin: string | null;
  horasTotales: number | null;
  programa: string;
  coordinador: string;
  semanasDetalle: Semana[];
};

export default function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const currentUser = useCurrentUser();
  const [initiative, setInitiative] = useState<InitiativeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<number | null>(null);
  const [evidenceInputs, setEvidenceInputs] = useState<Record<number, string>>({});

  useEffect(() => {
    const userId = currentUser?.id ?? null;
    if (!userId || !id) {
      setLoading(false);
      return;
    }

    const load = async () => {
      try {
        setLoading(true);
        const res = await fetch(
          `${API_BASE_URL}/docente/${userId}/iniciativas/${id}`
        );
        if (!res.ok) {
          setInitiative(null);
          return;
        }
        const data = (await res.json()) as InitiativeDetail;
        setInitiative(data);

        const inputs: Record<number, string> = {};
        (data.semanasDetalle || []).forEach((s) =>
          (s.entregables || []).forEach((e) => {
            inputs[e.id] = e.url_evidencia || "";
          })
        );
        setEvidenceInputs(inputs);
      } catch (err) {
        console.error(err);
        notify.error("No se pudo cargar la información. Intente de nuevo más tarde.");
        setInitiative(null);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [id, currentUser?.id]);

  const handleSaveEntregable = async (
    entregable: Entregable,
    nuevoCompletado: boolean
  ) => {
    try {
      setSaving(entregable.id);
      const res = await fetch(
        `${API_BASE_URL}/docente/entregables/${entregable.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            completado: nuevoCompletado,
            url_evidencia: evidenceInputs[entregable.id] || null,
          }),
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        notify.fromError(data, "No se pudo guardar el entregable.");
        return;
      }
      const saved = await res.json().catch(() => ({}));

      notify.success("Entregable guardado");

      setInitiative((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          semanasDetalle: prev.semanasDetalle.map((s) => ({
            ...s,
            entregables: s.entregables.map((e) => {
              if (e.id !== entregable.id) return e;
              return {
                ...e,
                completado: nuevoCompletado,
                url_evidencia: evidenceInputs[entregable.id] || null,
                fecha_real_entrega: nuevoCompletado
                  ? saved.fecha_real_entrega ?? e.fecha_real_entrega
                  : null,
                fecha_completado: nuevoCompletado
                  ? saved.fecha_real_entrega ?? e.fecha_completado
                  : null,
              };
            }),
          })),
        };
      });
    } catch (err) {
      console.error(err);
      notify.error("Error de conexión al guardar el entregable.");
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return (
      <Page>
        <PageLoading label="Cargando iniciativa…" />
      </Page>
    );
  }

  if (!initiative) {
    return (
      <Page>
        <Panel>
          <EmptyState
            icon={FolderOpen}
            title="No se encontró la iniciativa"
            action={
              <button type="button" onClick={() => navigate("/docente/proyectos")} className="ds-btn ds-btn-primary">
                Volver a mis iniciativas
              </button>
            }
          >
            Puede que no esté asignada a tu usuario o que ya no exista.
          </EmptyState>
        </Panel>
      </Page>
    );
  }

  const formatDate = (f: string | null) => formatDateOnly(f);

  const allEntregables = initiative.semanasDetalle.flatMap((s) => s.entregables);
  const totalEnt = allEntregables.length;
  const doneEnt = allEntregables.filter((e) => e.completado).length;
  const pct = totalEnt > 0 ? Math.round((doneEnt / totalEnt) * 100) : 0;

  const tipoKey = (initiative.tipo || "").toLowerCase();
  const tipo: { label: string; tone: Tone } =
    tipoKey === "convenio"
      ? { label: "Convenio", tone: "warning" }
      : tipoKey === "actividad"
      ? { label: "Actividad", tone: "signal" }
      : { label: "Iniciativa", tone: "violet" };
  const estadoKey = (initiative.estado || "").toLowerCase();
  const estado: { label: string; tone: Tone } =
    estadoKey === "en_ejecucion" || estadoKey === "active"
      ? { label: "En ejecución", tone: "success" }
      : estadoKey === "finalizado"
      ? { label: "Finalizado", tone: "brand" }
      : estadoKey === "delayed" || estadoKey === "retrasado"
      ? { label: "Retrasado", tone: "danger" }
      : estadoKey === "suspendido"
      ? { label: "Suspendido", tone: "warning" }
      : { label: initiative.estado || "Sin estado", tone: "neutral" };

  return (
    <Page>
      <div>
        <button
          type="button"
          onClick={() => navigate("/docente/proyectos")}
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-text-muted transition-colors hover:text-text"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden /> Volver a mis iniciativas
        </button>
        <PageHeader
          title={initiative.titulo}
          description={`${initiative.programa} · ${initiative.horasTotales ?? "—"} h · ${initiative.coordinador}`}
          meta={
            <>
              <StatusPill tone={tipo.tone} dot={false}>{tipo.label}</StatusPill>
              <StatusPill tone={estado.tone}>{estado.label}</StatusPill>
              <span className="text-xs text-text-subtle">
                Inicio {formatDate(initiative.fechaInicio)} · Fin estimado {formatDate(initiative.fechaFin)}
              </span>
            </>
          }
        />
      </div>

      <Panel>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-text" style={{ fontWeight: 600 }}>Progreso</p>
          <p className="text-xs tabular-nums text-text-subtle">
            {doneEnt} de {totalEnt} entregables completados · {pct}%
          </p>
        </div>
        <ProgressBar value={pct} tone="success" label="Progreso de entregables" />
      </Panel>

      {initiative.semanasDetalle.length === 0 && (
        <Panel>
          <EmptyState icon={Clock} title="Sin entregables programados">
            Esta iniciativa todavía no tiene semanas con entregables.
          </EmptyState>
        </Panel>
      )}

      <div className="space-y-4">
        {initiative.semanasDetalle.map((semana) => {
          const totalW = semana.entregables.length;
          const doneW = semana.entregables.filter((e) => e.completado).length;
          return (
            <Panel
              key={semana.id}
              title={`Semana ${semana.numero}`}
              description={`${formatDate(semana.fecha_inicio)} — ${formatDate(semana.fecha_fin)}`}
              action={
                <StatusPill tone={totalW > 0 && doneW === totalW ? "success" : "neutral"}>
                  {doneW}/{totalW} completados
                </StatusPill>
              }
              bodyClassName=""
            >
              <ul className="divide-y divide-line">
                {semana.entregables.map((e) => (
                  <li key={e.id} className="flex items-start gap-3 px-4 py-3">
                    <input
                      type="checkbox"
                      id={`ent-${e.id}`}
                      checked={e.completado}
                      onChange={() => handleSaveEntregable(e, !e.completado)}
                      className="mt-0.5 h-4 w-4 shrink-0 rounded accent-brand"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <label
                          htmlFor={`ent-${e.id}`}
                          className={`text-sm ${e.completado ? "text-text-subtle line-through" : "text-text"}`}
                        >
                          {e.descripcion}
                        </label>
                        <div className="flex shrink-0 items-center gap-2">
                          {e.horas != null && <StatusPill dot={false}>{e.horas} h</StatusPill>}
                          {saving === e.id && <Spinner className="h-4 w-4" />}
                        </div>
                      </div>

                      <div className="mt-2">
                        <label htmlFor={`url-${e.id}`} className="ds-label">
                          Enlace de evidencia (Drive o Forms)
                        </label>
                        <div className="flex items-center gap-2">
                          <div className="relative flex-1">
                            <Link2 className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-subtle" aria-hidden />
                            <input
                              id={`url-${e.id}`}
                              type="url"
                              value={evidenceInputs[e.id] || ""}
                              onChange={(ev) =>
                                setEvidenceInputs((prev) => ({
                                  ...prev,
                                  [e.id]: ev.target.value,
                                }))
                              }
                              placeholder="https://drive.google.com/…"
                              className="ds-input pl-8 text-[0.8125rem]"
                              onBlur={() => handleSaveEntregable(e, e.completado)}
                            />
                          </div>
                          {evidenceInputs[e.id]?.trim() && (
                            <a
                              href={evidenceInputs[e.id]}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="ds-btn ds-btn-ghost ds-btn-sm text-brand"
                              title="Abrir evidencia"
                              aria-label="Abrir evidencia en una pestaña nueva"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          )}
                        </div>

                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-subtle">
                          {e.completado ? (
                            <span className="inline-flex items-center gap-1 text-emerald-700">
                              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Completado
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1">
                              <Circle className="h-3.5 w-3.5" aria-hidden /> Pendiente
                            </span>
                          )}
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" aria-hidden /> Entrega real: {formatDate(e.fecha_real_entrega)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </Panel>
          );
        })}
      </div>
    </Page>
  );
}
