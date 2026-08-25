import { useCallback, useEffect, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router";
import { GraduationCap, ShieldCheck } from "lucide-react";
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
    <div className="min-h-screen bg-gradient-to-br from-[#1e3a8a] via-[#1d4ed8] to-[#3b82f6] flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -right-32 w-96 h-96 bg-white/5 rounded-full" />
        <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-white/5 rounded-full" />
      </div>
      <div className="relative w-full max-w-sm">
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <div className="flex flex-col items-center mb-7">
            <div className="w-16 h-16 bg-[#1e3a8a] rounded-2xl flex items-center justify-center mb-4 shadow-lg">
              <GraduationCap className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-gray-900 font-bold">ProySocial</h1>
            <p className="text-gray-500 text-sm text-center mt-1">
              Sistema de Seguimiento de Proyección Social
            </p>
          </div>

          <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-3 mb-5 flex gap-2.5">
            <ShieldCheck className="w-5 h-5 text-blue-700 shrink-0 mt-0.5" />
            <p className="text-xs text-blue-900 leading-relaxed">
              Ingresa únicamente con la cuenta de Google previamente autorizada por la institución.
            </p>
          </div>

          {googleClientId && (
            <div className={loading ? "opacity-50 pointer-events-none" : ""}>
              <div ref={buttonRef} className="min-h-11 flex justify-center" />
              {loading && <p className="text-center text-xs text-gray-500 mt-3">Validando tu cuenta…</p>}
            </div>
          )}

          <p className="text-center text-xs text-gray-400 mt-6">
            Corporación Unificada Nacional de Educación Superior "CUN"
          </p>
        </div>
      </div>
    </div>
  );
}
