import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router";
import { AlertCircle, ChevronDown, ChevronRight, Info, KeyRound, Loader2 } from "lucide-react";
import "@fontsource-variable/nunito-sans";
import { API_BASE } from "../config/api";
import { clearSession, getDemoPase, getSessionToken, readCurrentUser, saveSession, setDemoPase, setDemoSession } from "../config/auth";
import { notify } from "../lib/notify";
import "../components/b2/b2.css";
import "./login-b2.css";

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
type GoogleEstado = "sin-configurar" | "cargando" | "listo" | "error";

type DemoPaso = "cerrado" | "clave" | "usuarios";

const iniciales = (u: DevUser) => `${u.nombre.trim()[0] ?? ""}${u.apellido.trim()[0] ?? ""}`.toUpperCase();

export default function Login() {
  const navigate = useNavigate();
  const buttonRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(false);
  const [errorAcceso, setErrorAcceso] = useState("");
  const googleClientId = String(import.meta.env.VITE_GOOGLE_CLIENT_ID || "").trim();
  const [googleEstado, setGoogleEstado] = useState<GoogleEstado>(googleClientId ? "cargando" : "sin-configurar");
  const [googleDetalle, setGoogleDetalle] = useState("");
  const [reintento, setReintento] = useState(0);
  // Una sesión sólo sirve con token y usuario a la vez. Un remanente parcial en
  // localStorage no debe impedir volver a iniciar sesión, así que se descarta.
  const [session] = useState(() => {
    const token = getSessionToken();
    const user = readCurrentUser();
    if (token && user) return { token, user };
    if (token || user) clearSession();
    return null;
  });

  // Acceso de PRUEBAS locales: la sección solo aparece si el SERVIDOR confirma que está habilitado (responde con la lista de usuarios
  // sintéticos). El backend decide (base proysocial_dev, localhost, DEV_LOGIN_ENABLED); en producción la ruta no existe y aquí no se muestra
  // nada. `import.meta.env.DEV` solo evita incluir este código en las compilaciones de producción; no sustituye la autorización del servidor.
  const [devUsers, setDevUsers] = useState<DevUser[]>([]);
  const [devBase, setDevBase] = useState("");
  const [devAbierto, setDevAbierto] = useState(true);
  const [devElegido, setDevElegido] = useState("");
  useEffect(() => {
    if (!import.meta.env.DEV || session) return;
    let cancelled = false;
    window
      .fetch(`${API_BASE}/auth/dev/usuarios`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d?.usuarios?.length) return;
        const nombre = (u: DevUser) => `${u.nombre} ${u.apellido}`;
        const orden = [...(d.usuarios as DevUser[])].sort((a, b) =>
          a.rol === b.rol ? nombre(a).localeCompare(nombre(b)) : a.rol === "admin" ? -1 : 1
        );
        setDevUsers(orden);
        setDevBase(String(d.entorno?.base || ""));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [session]);

  // Modo DEMOSTRACIÓN (piloto): independiente del acceso de desarrollo y de Google. Solo se ofrece si el servidor lo confirma (/auth/demo/estado);
  // la clave se valida en el servidor y nunca se guarda en el cliente. Las sesiones son de solo lectura, lo hace cumplir el servidor.
  const [demoActivo, setDemoActivo] = useState(false);
  const [demoPaso, setDemoPaso] = useState<DemoPaso>("cerrado");
  const [demoClave, setDemoClave] = useState("");
  const [demoUsers, setDemoUsers] = useState<DevUser[]>([]);
  const [demoError, setDemoError] = useState("");
  const [demoCargando, setDemoCargando] = useState(false);
  const [demoElegido, setDemoElegido] = useState("");
  useEffect(() => {
    if (session) return;
    let cancelled = false;
    window
      .fetch(`${API_BASE}/auth/demo/estado`)
      .then((r) => (r.ok ? r.json() : null))
      .then(async (d) => {
        if (cancelled || !d?.habilitado) return;
        setDemoActivo(true);
        const pase = getDemoPase();
        if (!pase) return;
        const r = await window.fetch(`${API_BASE}/auth/demo/usuarios`, { headers: { Authorization: `Bearer ${pase}` } });
        if (cancelled) return;
        if (!r.ok) { setDemoPase(null); return; }
        const lista = await r.json().catch(() => null);
        if (lista?.usuarios?.length) { setDemoUsers(lista.usuarios as DevUser[]); setDemoPaso("usuarios"); }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [session]);

  const handleDemoClave = async (event: FormEvent) => {
    event.preventDefault();
    if (!demoClave || demoCargando) return;
    setDemoError("");
    setDemoCargando(true);
    try {
      const response = await window.fetch(`${API_BASE}/auth/demo/acceso`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clave: demoClave }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "No se pudo validar la clave");
      setDemoClave("");
      setDemoPase(data.pase);
      setDemoUsers(data.usuarios as DevUser[]);
      setDemoPaso("usuarios");
    } catch (cause) {
      setDemoError(cause instanceof Error ? cause.message : "No se pudo validar la clave");
    } finally {
      setDemoCargando(false);
    }
  };

  const handleDemoSesion = async (correo: string) => {
    setDemoError("");
    setDemoElegido(correo);
    try {
      setLoading(true);
      const response = await window.fetch(`${API_BASE}/auth/demo/sesion`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getDemoPase() || ""}` },
        body: JSON.stringify({ correo }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 401) {
        setDemoPase(null);
        setDemoPaso("clave");
        throw new Error("El acceso de demostración venció. Escribe la clave de nuevo.");
      }
      if (!response.ok) throw new Error(data.error || "No se pudo abrir la demostración");
      saveSession(data.token, data.user);
      setDemoSession(true);
      navigate(data.user.rol === "admin" ? "/admin" : "/docente", { replace: true });
    } catch (cause) {
      setDemoElegido("");
      setDemoError(cause instanceof Error ? cause.message : "No se pudo abrir la demostración");
    } finally {
      setLoading(false);
    }
  };

  const salirDemo = () => {
    setDemoPase(null);
    setDemoUsers([]);
    setDemoClave("");
    setDemoError("");
    setDemoPaso("cerrado");
  };

  const handleDevLogin = async (correo: string) => {
    setErrorAcceso("");
    setDevElegido(correo);
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
      setDevElegido("");
      setErrorAcceso(cause instanceof Error ? cause.message : "No se pudo iniciar la sesión de pruebas");
    } finally {
      setLoading(false);
    }
  };

  const handleCredential = useCallback(
    async ({ credential }: { credential?: string }) => {
      setErrorAcceso("");
      if (!credential) {
        setErrorAcceso("Google no entregó una credencial válida. Inténtalo de nuevo.");
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
        setErrorAcceso(cause instanceof Error ? cause.message : "No se pudo iniciar sesión");
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
    setGoogleEstado("cargando");
    setGoogleDetalle("");
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
          width: Math.min(400, Math.max(200, Math.round(container.getBoundingClientRect().width) || 320)),
          locale: "es",
        });
        // Google rechaza el render sin lanzar excepción cuando el origen no está
        // autorizado en el cliente OAuth: el contenedor simplemente queda vacío.
        verifyTimer = window.setTimeout(() => {
          if (cancelled) return;
          const height = Math.round(container.getBoundingClientRect().height);
          if (container.childElementCount > 0 && height > 0) {
            setGoogleEstado("listo");
            return;
          }
          setGoogleEstado("error");
          setGoogleDetalle(
            `Google no mostró el botón para el origen ${window.location.origin}. Debe figurar en «Orígenes autorizados de JavaScript» del cliente OAuth.`
          );
        }, 1500);
      })
      .catch((cause) => {
        if (cancelled) return;
        setGoogleEstado("error");
        setGoogleDetalle(cause instanceof Error ? cause.message : "No se pudo cargar Google.");
      });
    return () => {
      cancelled = true;
      window.clearTimeout(verifyTimer);
    };
  }, [session, googleClientId, handleCredential, reintento]);

  if (session) {
    return <Navigate to={session.user.rol === "admin" ? "/admin" : "/docente"} replace />;
  }

  return (
    <div className="b2-scope lg-root">
      {/* Panel de identidad (solo escritorio) */}
      <aside className="lg-brand" aria-label="ProySocial">
        <svg className="lg-geo" viewBox="0 0 560 560" fill="none" aria-hidden>
          <g stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
            <path d="M120 440 280 330M280 330 460 400M280 330 330 170M330 170 480 110M330 170 190 120M460 400 520 280M120 440 60 330" />
          </g>
          <g fill="currentColor">
            <circle cx="280" cy="330" r="13" />
            <circle cx="120" cy="440" r="6" />
            <circle cx="330" cy="170" r="8" />
          </g>
          <g stroke="currentColor" strokeWidth="1.6">
            <circle cx="460" cy="400" r="11" />
            <circle cx="480" cy="110" r="9" />
            <circle cx="190" cy="120" r="7" />
            <circle cx="520" cy="280" r="6" />
            <circle cx="60" cy="330" r="7" />
          </g>
        </svg>
        <div className="lg-brand-top">
          <span className="lg-brand-name">
            <strong>Corporación Unificada Nacional</strong>
            <span>CUN</span>
          </span>
        </div>
        <div className="lg-brand-body">
          <h2>Seguimiento de Proyección Social</h2>
          <p>Organización y trazabilidad de entregables, evidencias y revisión del semestre, con transparencia para docentes y coordinación.</p>
        </div>
        <p className="lg-brand-foot">Acceso exclusivo para usuarios autorizados</p>
      </aside>

      <main className="lg-main">
        {/* Identidad institucional compacta (tableta y móvil); el logo de ProySocial va en la tarjeta */}
        <header className="lg-top">
          <span className="lg-brand-name"><strong>Corporación Unificada Nacional</strong><span>CUN</span></span>
        </header>

        <div className="lg-col">
          <section className="lg-card" aria-labelledby="lg-titulo">
            <img className="lg-logo" src="/branding/logo-proysocial-vertical.png" alt="ProySocial · Proyección Social" width="79" height="104" />
            <h1 id="lg-titulo">Bienvenido a ProySocial</h1>
            <p className="lg-sub">Ingresa para consultar y gestionar el seguimiento de Proyección Social.</p>

            <div className="lg-bloque" aria-busy={loading || googleEstado === "cargando"}>
              <p className="lg-etq">Acceso institucional</p>
              {googleEstado === "sin-configurar" ? (
                <p className="lg-aviso" role="status">
                  <Info aria-hidden />
                  <span>
                    El inicio de sesión con Google no está configurado en este entorno.
                    {devUsers.length > 0 ? " Usa el acceso de desarrollo." : demoActivo ? " Puedes explorar la demostración." : ""}
                  </span>
                </p>
              ) : (
                <div className={`lg-google${loading ? " is-loading" : ""}`}>
                  <div ref={buttonRef} className="lg-google-btn" hidden={googleEstado === "error"} />
                  {googleEstado === "cargando" && <div className="lg-esqueleto" aria-hidden />}
                  {googleEstado === "error" && (
                    <div className="lg-aviso is-error" role="alert">
                      <AlertCircle aria-hidden />
                      <div>
                        <p>No se pudo mostrar el acceso con Google.</p>
                        <p className="lg-aviso-d">{googleDetalle}</p>
                        <button type="button" className="lg-link" onClick={() => setReintento((n) => n + 1)}>
                          Reintentar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
              <p className="lg-nota">Solo ingresan las cuentas de Google previamente autorizadas por la institución.</p>
              {loading && (
                <p className="lg-estado" role="status">
                  <Loader2 aria-hidden className="lg-spin" /> Validando tu cuenta…
                </p>
              )}
              {errorAcceso && (
                <p className="lg-aviso is-error" role="alert">
                  <AlertCircle aria-hidden />
                  <span>{errorAcceso}</span>
                </p>
              )}
            </div>

            {demoActivo && (
              <div className="lg-dev lg-demo">
                <div className="lg-dev-cab lg-demo-cab">
                  <span className="lg-dev-tit">
                    <span className="lg-dev-tag">DEMO</span>
                    <span>
                      <strong>Entorno de demostración</strong>
                      <span>Datos sintéticos · Solo lectura</span>
                    </span>
                  </span>
                </div>
                {demoPaso === "cerrado" && (
                  <button type="button" className="lg-btn-sec" onClick={() => { setDemoError(""); setDemoPaso("clave"); }}>
                    <KeyRound aria-hidden /> Explorar demostración
                  </button>
                )}
                {demoPaso === "clave" && (
                  <form className="lg-demo-form" onSubmit={handleDemoClave}>
                    <label htmlFor="lg-demo-clave">Clave de acceso a la demostración</label>
                    <input
                      id="lg-demo-clave"
                      type="password"
                      autoComplete="off"
                      autoFocus
                      value={demoClave}
                      onChange={(e) => setDemoClave(e.target.value)}
                      disabled={demoCargando}
                      maxLength={200}
                    />
                    <div className="lg-demo-acc">
                      <button type="submit" className="lg-btn-sec is-primary" disabled={!demoClave || demoCargando} aria-busy={demoCargando}>
                        {demoCargando ? <Loader2 aria-hidden className="lg-spin" /> : null} Entrar
                      </button>
                      <button type="button" className="lg-link" onClick={salirDemo}>Cancelar</button>
                    </div>
                  </form>
                )}
                {demoPaso === "usuarios" && (
                  <>
                    <ul className="lg-dev-lista" aria-label="Usuarios de la demostración">
                      {demoUsers.map((u) => {
                        const elegido = demoElegido === u.correo;
                        return (
                          <li key={u.correo}>
                            <button
                              type="button"
                              className={`lg-user${elegido ? " is-selected" : ""}${u.rol === "admin" ? " is-admin" : ""}`}
                              disabled={loading}
                              aria-busy={elegido && loading}
                              onClick={() => handleDemoSesion(u.correo)}
                            >
                              <span className="lg-av" aria-hidden>{iniciales(u)}</span>
                              <span className="lg-user-d">
                                <span className="lg-user-l">
                                  <span className="lg-user-n">{u.nombre} {u.apellido}</span>
                                  <span className={`lg-rol${u.rol === "admin" ? " is-admin" : ""}`}>
                                    {u.rol === "admin" ? "Administrador" : "Docente"}
                                  </span>
                                </span>
                              </span>
                              {elegido && loading ? <Loader2 aria-hidden className="lg-spin lg-go" /> : <ChevronRight aria-hidden className="lg-go" />}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                    <button type="button" className="lg-link" onClick={salirDemo}>Salir de la demostración</button>
                  </>
                )}
                {demoError && (
                  <p className="lg-aviso is-error" role="alert">
                    <AlertCircle aria-hidden />
                    <span>{demoError}</span>
                  </p>
                )}
              </div>
            )}

            {import.meta.env.DEV && devUsers.length > 0 && (
              <div className="lg-dev">
                <button
                  type="button"
                  className="lg-dev-cab"
                  aria-expanded={devAbierto}
                  aria-controls="lg-dev-lista"
                  onClick={() => setDevAbierto((v) => !v)}
                >
                  <span className="lg-dev-tit">
                    <span className="lg-dev-tag">DEV</span>
                    <span>
                      <strong>Acceso de desarrollo</strong>
                      <span title={devBase ? `Base ${devBase}` : undefined}>Usuarios de prueba · Información sintética</span>
                    </span>
                  </span>
                  <ChevronDown aria-hidden className={devAbierto ? "is-open" : ""} />
                </button>
                {devAbierto && (
                  <ul id="lg-dev-lista" className="lg-dev-lista">
                    {devUsers.map((u) => {
                      const elegido = devElegido === u.correo;
                      return (
                        <li key={u.correo}>
                          <button
                            type="button"
                            className={`lg-user${elegido ? " is-selected" : ""}${u.rol === "admin" ? " is-admin" : ""}`}
                            disabled={loading}
                            aria-busy={elegido && loading}
                            onClick={() => handleDevLogin(u.correo)}
                          >
                            <span className="lg-av" aria-hidden>{iniciales(u)}</span>
                            <span className="lg-user-d">
                              <span className="lg-user-l">
                                <span className="lg-user-n">{u.nombre} {u.apellido}</span>
                                <span className={`lg-rol${u.rol === "admin" ? " is-admin" : ""}`}>
                                  {u.rol === "admin" ? "Administrador" : "Docente"}
                                </span>
                              </span>
                              <span className="lg-user-c">{u.correo}</span>
                            </span>
                            {elegido && loading ? <Loader2 aria-hidden className="lg-spin lg-go" /> : <ChevronRight aria-hidden className="lg-go" />}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
          </section>

          <p className="lg-pie">Corporación Unificada Nacional de Educación Superior «CUN»</p>
        </div>
      </main>
    </div>
  );
}
