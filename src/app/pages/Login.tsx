import { useCallback, useEffect, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router";
import { ClipboardCheck, FileCheck2, ShieldCheck, TableProperties } from "lucide-react";
import { Marca } from "../components/ds/Marca";
import { API_BASE } from "../config/api";
import { clearSession, getSessionToken, readCurrentUser, saveSession } from "../config/auth";
import { notify } from "../lib/notify";

const GOOGLE_SCRIPT_ID = "google-identity-services";
const GOOGLE_SCRIPT_SRC = "https://accounts.google.com/gsi/client";

// El evento "load" no vuelve a dispararse si el script ya está en el DOM
// (StrictMode y HMR reejecutan este efecto), por eso se consulta window.google.
function waitForGoogleIdentity(timeoutMs = 8000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      if (window.google?.accounts?.id) return resolve();
      if (Date.now() - start > timeoutMs) {
        reject(
          new Error(
            "No fue posible cargar Google Identity Services. Revisa tu conexión o desactiva extensiones que bloqueen accounts.google.com."
          )
        );
        return;
      }
      window.setTimeout(check, 100);
    };
    check();
  });
}

function loadGoogleIdentity(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (!document.getElementById(GOOGLE_SCRIPT_ID)) {
    const script = document.createElement("script");
    script.id = GOOGLE_SCRIPT_ID;
    script.src = GOOGLE_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
  }
  return waitForGoogleIdentity();
}

type DevUser = { id: number; nombre: string; apellido: string; correo: string; rol: "admin" | "docente" };

export default function Login() {
  const navigate = useNavigate();
  const buttonRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(false);
  const googleClientId = String(import.meta.env.VITE_GOOGLE_CLIENT_ID || "").trim();
  // Una sesión sólo sirve con token y usuario a la vez. Un remanente parcial en
  // localStorage no debe impedir volver a iniciar sesión, así que se descarta.
  const [session] = useState(() => {
    const token = getSessionToken();
    const user = readCurrentUser();
    if (token && user) return { token, user };
    if (token || user) clearSession();
    return null;
  });

  useEffect(() => {
    if (!googleClientId && !session) {
      notify.warning("Falta configurar VITE_GOOGLE_CLIENT_ID en el archivo .env.");
    }
  }, [googleClientId, session]);

  // Acceso de PRUEBAS locales: solo existe en `vite dev` y solo si el servidor lo habilita
  // (base proysocial_dev, localhost). En una compilación de producción este bloque no se incluye
  // y el servidor rechaza la ruta aunque se invoque.
  const [devUsers, setDevUsers] = useState<DevUser[]>([]);
  useEffect(() => {
    if (!import.meta.env.DEV || session) return;
    let cancelled = false;
    window
      .fetch(`${API_BASE}/auth/dev/usuarios`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d?.usuarios?.length) setDevUsers(d.usuarios);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [session]);

  const handleDevLogin = async (correo: string) => {
    try {
      setLoading(true);
      const response = await window.fetch(`${API_BASE}/auth/dev/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ correo }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "No se pudo iniciar la sesión de pruebas");
      saveSession(data.token, data.user);
      navigate(data.user.rol === "admin" ? "/admin" : "/docente", { replace: true });
    } catch (cause) {
      notify.fromError(cause, "No se pudo iniciar la sesión de pruebas");
    } finally {
      setLoading(false);
    }
  };

  const handleCredential = useCallback(
    async ({ credential }: { credential?: string }) => {
      if (!credential) {
        notify.error("Google no entregó una credencial válida.");
        return;
      }
      try {
        setLoading(true);
        const response = await window.fetch(`${API_BASE}/auth/google`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ credential }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "No se pudo iniciar sesión con Google");
        if (!data.token || !data.user?.rol) throw new Error("Respuesta de autenticación incompleta");
        saveSession(data.token, data.user);
        notify.success("Sesión iniciada");
        navigate(data.user.rol === "admin" ? "/admin" : "/docente", { replace: true });
      } catch (cause) {
        notify.fromError(cause, "No se pudo iniciar sesión");
      } finally {
        setLoading(false);
      }
    },
    [navigate]
  );

  useEffect(() => {
    if (!googleClientId || session || !buttonRef.current) return;
    let cancelled = false;
    let verifyTimer = 0;
    void loadGoogleIdentity()
      .then(() => {
        const container = buttonRef.current;
        if (cancelled || !container || !window.google) return;
        container.replaceChildren();
        window.google.accounts.id.initialize({
          client_id: googleClientId,
          callback: handleCredential,
          cancel_on_tap_outside: true,
        });
        window.google.accounts.id.renderButton(container, {
          theme: "outline",
          size: "large",
          text: "continue_with",
          shape: "rectangular",
          width: 320,
          locale: "es",
        });
        // Google rechaza el render sin lanzar excepción cuando el origen no está
        // autorizado en el cliente OAuth: el contenedor simplemente queda vacío.
        verifyTimer = window.setTimeout(() => {
          if (cancelled) return;
          const height = Math.round(container.getBoundingClientRect().height);
          if (container.childElementCount > 0 && height > 0) return;
          notify.error(
            `Google no pintó el botón para el origen ${window.location.origin}. Agrégalo en "Orígenes autorizados de JavaScript" del cliente OAuth en Google Cloud Console.`
          );
        }, 1500);
      })
      .catch((cause) => {
        if (cancelled) return;
        notify.fromError(cause, "No se pudo cargar Google");
      });
    return () => {
      cancelled = true;
      window.clearTimeout(verifyTimer);
    };
  }, [session, googleClientId, handleCredential]);

  if (session) {
    return <Navigate to={session.user.rol === "admin" ? "/admin" : "/docente"} replace />;
  }

  return (
    <div className="grid min-h-dvh bg-canvas lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      {/* Panel de marca */}
      <aside className="on-ink relative hidden overflow-hidden bg-ink text-ink-text lg:flex lg:flex-col lg:justify-between lg:p-12">
        <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.07]" aria-hidden>
          <defs>
            <pattern id="grid" width="44" height="44" patternUnits="userSpaceOnUse">
              <path d="M44 0H0V44" fill="none" stroke="white" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
        <div className="relative flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand text-white"><Marca className="h-6 w-6" /></span>
          <span className="leading-tight">
            <span className="block text-lg text-white" style={{ fontWeight: 650, letterSpacing: "-0.01em" }}>ProySocial</span>
            <span className="block text-xs text-ink-muted">Corporación Unificada Nacional · CUN</span>
          </span>
        </div>

        <div className="relative max-w-xl">
          <h2 className="text-balance text-[2.5rem] leading-[1.08] text-white" style={{ fontWeight: 650, letterSpacing: "-0.03em" }}>
            Cada entregable de Proyección Social, con su evidencia y su revisión.
          </h2>
          <ul className="mt-9 space-y-4">
            {[
              { icon: TableProperties, t: "Matrices de seguimiento", d: "Entregables, semanas, horas y vencimientos del semestre en una sola vista." },
              { icon: FileCheck2, t: "Evidencias con trazabilidad", d: "Enlaces, versiones e historial de cada envío, observación y aprobación." },
              { icon: ClipboardCheck, t: "Revisión de coordinación", d: "Una bandeja para aprobar, observar y resolver problemas de acceso." },
            ].map((x) => (
              <li key={x.t} className="flex gap-3.5">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ink-3 text-signal-bright"><x.icon className="h-[18px] w-[18px]" /></span>
                <span>
                  <span className="block text-[0.9375rem] text-white" style={{ fontWeight: 600 }}>{x.t}</span>
                  <span className="block text-sm text-ink-muted">{x.d}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-ink-muted">Seguimiento de Proyección Social · acceso institucional</p>
      </aside>

      {/* Acceso */}
      <main className="flex items-center justify-center px-5 py-10 sm:px-8">
        <div className="w-full max-w-[400px]">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink text-white"><Marca className="h-6 w-6" /></span>
            <span className="text-lg text-text" style={{ fontWeight: 650, letterSpacing: "-0.01em" }}>ProySocial</span>
          </div>

          <h1 className="text-[1.75rem]">Inicia sesión</h1>
          <p className="mt-1.5 text-sm text-text-muted">Accede con tu cuenta institucional de Google para ver tu seguimiento.</p>

          <div className="ds-panel mt-7 p-6">
            <div className="mb-5 flex gap-2.5 rounded-lg bg-brand-soft px-3.5 py-3">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" aria-hidden />
              <p className="text-xs leading-relaxed text-blue-900">
                Ingresa únicamente con la cuenta de Google previamente autorizada por la institución.
              </p>
            </div>

            {googleClientId ? (
              <div className={loading ? "pointer-events-none opacity-50" : ""}>
                <div ref={buttonRef} className="flex min-h-11 justify-center" />
                {loading && <p className="mt-3 text-center text-xs text-text-subtle" role="status">Validando tu cuenta…</p>}
              </div>
            ) : (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs text-amber-800" role="status">
                El inicio de sesión con Google no está configurado en este entorno.
              </p>
            )}
          </div>

          {import.meta.env.DEV && devUsers.length > 0 && (
            <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4">
              <p className="text-xs text-amber-900" style={{ fontWeight: 650 }}>Entorno de pruebas local · datos sintéticos</p>
              <p className="mb-3 mt-0.5 text-xs text-amber-800">
                Base <code>proysocial_dev</code>, solo en localhost. No es producción ni usa Google.
              </p>
              <div className="space-y-1.5">
                {devUsers.map((u) => (
                  <button
                    key={u.correo}
                    type="button"
                    disabled={loading}
                    onClick={() => handleDevLogin(u.correo)}
                    className="w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-left text-xs transition-colors hover:bg-amber-100 disabled:opacity-50"
                  >
                    <span className="text-text" style={{ fontWeight: 650 }}>{u.nombre} {u.apellido}</span>{" "}
                    <span className="text-text-subtle">· {u.rol === "admin" ? "Administrador" : "Docente"}</span>
                    <span className="block text-text-subtle">{u.correo}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <p className="mt-8 text-center text-xs text-text-subtle">
            Corporación Unificada Nacional de Educación Superior «CUN»
          </p>
        </div>
      </main>
    </div>
  );
}
