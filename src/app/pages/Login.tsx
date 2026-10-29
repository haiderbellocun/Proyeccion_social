import { useCallback, useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router";
import { AlertCircle, ChevronDown, ChevronRight, Info, KeyRound, Loader2 } from "lucide-react";
import "@fontsource-variable/nunito-sans";
import { API_BASE } from "../config/api";
import { clearSession, getDemoPase, getSessionToken, readCurrentUser, saveSession, setDemoPase, setDemoSession } from "../config/auth";
import { notify } from "../lib/notify";
import "../components/b2/b2.css";
import "./login-b2.css";
import { LoginMotionBackground, LoginMotionMini } from "./LoginMotionBackground";

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

type CardUser = Pick<DevUser, "nombre" | "apellido" | "correo" | "rol">;
type DemoCarga = "cargando" | "listo" | "error";

const iniciales = (u: CardUser) => `${u.nombre.trim()[0] ?? ""}${u.apellido.trim()[0] ?? ""}`.toUpperCase();

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

  // Modo DEMOSTRACIÓN (piloto en GCP): independiente del acceso de desarrollo y de Google. Solo se ofrece si el servidor lo confirma
  // (/auth/demo/estado). Las cinco tarjetas vienen de ese endpoint y se ven siempre; elegir una sin haber validado la clave pide la clave
  // (se valida en el servidor y nunca se guarda en el cliente) y luego entra con ese usuario. Con el pase de la pestaña, cambiar de usuario
  // es un clic. Las sesiones son de solo lectura: lo hace cumplir el servidor.
  // Un 404 en /estado = «demostración apagada en este servidor» (respuesta válida: no se muestra nada). Cualquier otro fallo (red, 5xx,
  // base de datos caída, lista vacía) NO se oculta: el bloque aparece con el motivo y un botón para reintentar.
  const [demoActivo, setDemoActivo] = useState(false);
  // Modo abierto del piloto: sin clave y con escritura (datos sintéticos de pruebas con revisores).
  const [demoAbierto, setDemoAbierto] = useState(false);
  const [demoCarga, setDemoCarga] = useState<DemoCarga>("cargando");
  const [demoFallo, setDemoFallo] = useState("");
  const [demoReintento, setDemoReintento] = useState(0);
  const [demoAutorizado, setDemoAutorizado] = useState(false);
  const [demoPendiente, setDemoPendiente] = useState("");
  const [demoClave, setDemoClave] = useState("");
  const [demoUsers, setDemoUsers] = useState<CardUser[]>([]);
  const [demoError, setDemoError] = useState("");
  const [demoCargando, setDemoCargando] = useState(false);
  const [demoElegido, setDemoElegido] = useState("");
  useEffect(() => {
    if (session) return;
    let cancelled = false;
    setDemoCarga("cargando");
    setDemoFallo("");
    (async () => {
      const re = await window.fetch(`${API_BASE}/auth/demo/estado`);
      if (cancelled) return;
      if (re.status === 404) return setDemoCarga("listo");
      if (!re.ok) {
        const e = await re.json().catch(() => null);
        throw new Error(e?.error ? `${e.error} (${re.status})` : `El servidor respondió ${re.status} al consultar el acceso de demostración.`);
      }
      const d = await re.json().catch(() => null);
      if (cancelled) return;
      if (!d?.habilitado) return setDemoCarga("listo");
      if (!Array.isArray(d.usuarios) || !d.usuarios.length) throw new Error("El servidor no devolvió usuarios de demostración.");
      setDemoActivo(true);
      setDemoAbierto(Boolean(d.abierto));
      setDemoUsers(d.usuarios as CardUser[]);
      const pase = getDemoPase();
      // Abierto (escribe) o público (solo lectura): no hay clave; cada tarjeta inicia sesión directamente.
      if (d.abierto || d.publico) setDemoAutorizado(true);
      else if (pase) {
        const r = await window.fetch(`${API_BASE}/auth/demo/usuarios`, { headers: { Authorization: `Bearer ${pase}` } });
        if (cancelled) return;
        if (r.status === 401) setDemoPase(null); // El pase de la pestaña venció: se vuelve a pedir la clave (no es un error).
        else if (!r.ok) throw new Error(`El servidor respondió ${r.status} al comprobar el acceso de demostración.`);
        else setDemoAutorizado(true);
      }
      setDemoCarga("listo");
    })().catch((cause) => {
      if (cancelled) return;
      setDemoFallo(cause instanceof TypeError ? "No hay conexión con el servidor." : cause instanceof Error ? cause.message : "Error desconocido.");
      setDemoCarga("error");
    });
    return () => {
      cancelled = true;
    };
  }, [session, demoReintento]);

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
        setDemoAutorizado(false);
        setDemoPendiente(correo);
        throw new Error("El acceso de demostración venció. Escribe la clave de nuevo.");
      }
      if (!response.ok) throw new Error(data.error || "No se pudo abrir la demostración");
      saveSession(data.token, data.user);
      setDemoSession(!demoAbierto);
      navigate(data.user.rol === "admin" ? "/admin" : "/docente", { replace: true });
    } catch (cause) {
      setDemoElegido("");
      setDemoError(cause instanceof Error ? cause.message : "No se pudo abrir la demostración");
    } finally {
      setLoading(false);
    }
  };

  const handleDemoTarjeta = (correo: string) => {
    if (demoAutorizado) return void handleDemoSesion(correo);
    setDemoError("");
    setDemoPendiente(correo);
  };

  const handleDemoClave = async (event: FormEvent) => {
    event.preventDefault();
    if (!demoClave || demoCargando || !demoPendiente) return;
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
      setDemoAutorizado(true);
      const correo = demoPendiente;
      setDemoPendiente("");
      void handleDemoSesion(correo);
    } catch (cause) {
      setDemoError(cause instanceof Error ? cause.message : "No se pudo validar la clave");
    } finally {
      setDemoCargando(false);
    }
  };

  const salirDemo = () => {
    setDemoPase(null);
    setDemoAutorizado(false);
    setDemoPendiente("");
    setDemoClave("");
    setDemoError("");
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
        <LoginMotionBackground />
        <div className="lg-brand-top">
          <span className="lg-brand-name">
            <strong>Corporación Unificada Nacional</strong>
            <span>CUN</span>
          </span>
        </div>
        <div className="lg-brand-body">
          <h2>
            <span className="lg-linea"><span>Seguimiento de</span></span>{" "}
            <span className="lg-linea"><span>Proyección Social</span></span>
          </h2>
          <p>Organización y trazabilidad de entregables, evidencias y revisión del semestre, con transparencia para docentes y coordinación.</p>
        </div>
        <p className="lg-brand-foot">Acceso exclusivo para usuarios autorizados</p>
      </aside>

      <main className="lg-main">
        {/* Identidad institucional compacta (tableta y móvil); el logo de ProySocial va en la tarjeta */}
        <header className="lg-top">
          <span className="lg-brand-name"><strong>Corporación Unificada Nacional</strong><span>CUN</span></span>
          <LoginMotionMini />
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

            {(demoActivo || demoCarga === "error") && (
              <div className="lg-dev lg-demo" data-testid="demo-selector" aria-busy={demoCarga === "cargando"}>
                <div className="lg-dev-cab lg-demo-cab">
                  <span className="lg-dev-tit">
                    <span className="lg-dev-tag">DEMO</span>
                    <span>
                      <strong>{demoAbierto ? "Entorno de pruebas" : "Entorno de demostración"}</strong>
                      <span>{demoAbierto ? "Datos sintéticos · Puedes probar y modificar" : "Datos sintéticos · Solo lectura"}</span>
                    </span>
                  </span>
                </div>
                {demoCarga === "error" && (
                  <div className="lg-aviso is-error" role="alert" data-testid="demo-fallo">
                    <AlertCircle aria-hidden />
                    <div>
                      <p>No se pudo cargar el acceso de demostración.</p>
                      <p className="lg-aviso-d">{demoFallo}</p>
                      <button type="button" className="lg-link" onClick={() => setDemoReintento((n) => n + 1)}>
                        Reintentar
                      </button>
                    </div>
                  </div>
                )}
                {demoCarga === "cargando" && <div className="lg-esqueleto" aria-hidden />}
                {demoCarga === "listo" && (
                  <>
                    <ul className="lg-dev-lista" aria-label="Usuarios de la demostración">
                      {demoUsers.map((u, i) => {
                        const elegido = demoElegido === u.correo || demoPendiente === u.correo;
                        return (
                          <li key={u.correo} style={{ "--i": i } as CSSProperties}>
                            <button
                              type="button"
                              data-testid="demo-usuario"
                              className={`lg-user${elegido ? " is-selected" : ""}${u.rol === "admin" ? " is-admin" : ""}`}
                              disabled={loading}
                              aria-busy={demoElegido === u.correo && loading}
                              onClick={() => handleDemoTarjeta(u.correo)}
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
                              {demoElegido === u.correo && loading ? <Loader2 aria-hidden className="lg-spin lg-go" /> : <ChevronRight aria-hidden className="lg-go" />}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                    {!demoAutorizado && demoPendiente && (
                      <form className="lg-demo-form" onSubmit={handleDemoClave} data-testid="demo-clave-form">
                        <label htmlFor="lg-demo-clave">Clave de acceso al piloto para ingresar como {demoUsers.find((u) => u.correo === demoPendiente)?.nombre}</label>
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
                            {demoCargando ? <Loader2 aria-hidden className="lg-spin" /> : <KeyRound aria-hidden />} Entrar
                          </button>
                          <button type="button" className="lg-link" onClick={() => { setDemoPendiente(""); setDemoClave(""); setDemoError(""); }}>Cancelar</button>
                        </div>
                      </form>
                    )}
                    {!demoAutorizado && !demoPendiente && <p className="lg-nota">Elige un usuario; se te pedirá la clave del piloto.</p>}
                    {demoAutorizado && !demoAbierto && <button type="button" className="lg-link" onClick={salirDemo}>Cerrar acceso de demostración</button>}
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
              <div className="lg-dev" data-testid="dev-selector">
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
                    {devUsers.map((u, i) => {
                      const elegido = devElegido === u.correo;
                      return (
                        <li key={u.correo} style={{ "--i": i } as CSSProperties}>
                          <button
                            type="button"
                            data-testid="dev-usuario"
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
