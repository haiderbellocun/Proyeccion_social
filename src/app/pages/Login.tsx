import { useState } from "react";
import { useNavigate, Link } from "react-router";
import { GraduationCap, Mail, Lock, Eye, EyeOff, LogIn } from "lucide-react";

const API_BASE_URL = "http://localhost:4000";

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [role, setRole] = useState<"teacher" | "admin">("teacher");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE_URL}/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const msg = data?.error || "No se pudo iniciar sesión";
        setError(msg);
        setLoading(false);
        return;
      }

      const data = await res.json();
      const user = data.user;

      if (!user || !user.rol) {
        setError("Respuesta de servidor inválida.");
        setLoading(false);
        return;
      }

      // Guardamos usuario en localStorage para poder usarlo después (docente id, rol, etc.)
      try {
        window.localStorage.setItem("proysocial:user", JSON.stringify(user));
      } catch {
        // ignore storage errors
      }

      if (user.rol === "admin") {
        navigate("/admin");
      } else {
        navigate("/docente");
      }
    } catch (err) {
      console.error(err);
      setError("Error de conexión con el servidor. Verifica que el backend esté encendido.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1e3a8a] via-[#1d4ed8] to-[#3b82f6] flex items-center justify-center p-4">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -right-32 w-96 h-96 bg-white/5 rounded-full" />
        <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-white/5 rounded-full" />
        <div className="absolute top-1/2 left-1/4 w-48 h-48 bg-white/3 rounded-full" />
      </div>

      <div className="relative w-full max-w-sm">
        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 bg-[#1e3a8a] rounded-2xl flex items-center justify-center mb-4 shadow-lg">
              <GraduationCap className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-gray-900" style={{ fontWeight: 700 }}>
              ProySocial
            </h1>
            <p className="text-gray-500 text-sm text-center mt-1">
              Sistema de Seguimiento de Proyección Social
            </p>
          </div>

          {/* Role selector */}
          <div className="flex bg-gray-100 rounded-lg p-1 mb-6">
            <button
              onClick={() => setRole("teacher")}
              className={`flex-1 py-2 text-sm rounded-md transition-all ${
                role === "teacher"
                  ? "bg-white text-[#1e3a8a] shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
              style={{ fontWeight: role === "teacher" ? 600 : 400 }}
            >
              Docente
            </button>
            <button
              onClick={() => setRole("admin")}
              className={`flex-1 py-2 text-sm rounded-md transition-all ${
                role === "admin"
                  ? "bg-white text-[#1e3a8a] shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
              style={{ fontWeight: role === "admin" ? 600 : 400 }}
            >
              Administrador
            </button>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-700 mb-1.5" style={{ fontWeight: 500 }}>
                Correo institucional
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="usuario@universidad.edu"
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1d4ed8] focus:border-transparent bg-gray-50 transition-all"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm text-gray-700 mb-1.5" style={{ fontWeight: 500 }}>
                Contraseña
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type={showPass ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-10 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1d4ed8] focus:border-transparent bg-gray-50 transition-all"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <div className="flex justify-end">
              <Link
                to="/recuperar-contrasena"
                className="text-sm text-[#1d4ed8] hover:text-[#1e3a8a] transition-colors"
              >
                ¿Olvidaste tu contraseña?
              </Link>
            </div>

            <button
              type="submit"
              className={`w-full bg-[#1e3a8a] hover:bg-[#1d4ed8] text-white py-2.5 rounded-lg text-sm flex items-center justify-center gap-2 transition-colors shadow-sm ${
                loading ? "opacity-80 cursor-not-allowed" : ""
              }`}
              style={{ fontWeight: 600 }}
              disabled={loading}
            >
              <LogIn className="w-4 h-4" />
              {loading ? "Ingresando..." : "Iniciar sesión"}
            </button>
          </form>

          <p className="text-center text-xs text-gray-400 mt-6">
            Corporación Unificada Nacional de Educación Superior "CUN"
          </p>
        </div>
      </div>
    </div>
  );
}
