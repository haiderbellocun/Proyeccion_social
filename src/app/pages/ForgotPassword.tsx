import { useState } from "react";
import { Link } from "react-router";
import { GraduationCap, Mail, ArrowLeft, CheckCircle2, Send } from "lucide-react";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSent(true);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1e3a8a] via-[#1d4ed8] to-[#3b82f6] flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -right-32 w-96 h-96 bg-white/5 rounded-full" />
        <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-white/5 rounded-full" />
      </div>

      <div className="relative w-full max-w-sm">
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 bg-[#1e3a8a] rounded-2xl flex items-center justify-center mb-4 shadow-lg">
              <GraduationCap className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-gray-900" style={{ fontWeight: 700 }}>
              Recuperar contraseña
            </h1>
            <p className="text-gray-500 text-sm text-center mt-1">
              Te enviaremos un enlace para restablecer tu contraseña
            </p>
          </div>

          {!sent ? (
            <form onSubmit={handleSubmit} className="space-y-4">
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

              <button
                type="submit"
                className="w-full bg-[#1e3a8a] hover:bg-[#1d4ed8] text-white py-2.5 rounded-lg text-sm flex items-center justify-center gap-2 transition-colors shadow-sm"
                style={{ fontWeight: 600 }}
              >
                <Send className="w-4 h-4" />
                Enviar enlace de recuperación
              </button>
            </form>
          ) : (
            <div className="text-center space-y-4">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8 text-emerald-600" />
              </div>
              <div>
                <p className="text-gray-800 text-sm" style={{ fontWeight: 600 }}>
                  ¡Correo enviado!
                </p>
                <p className="text-gray-500 text-sm mt-1">
                  Revisa tu bandeja de entrada en{" "}
                  <span className="text-[#1d4ed8]">{email}</span> y sigue las
                  instrucciones para restablecer tu contraseña.
                </p>
              </div>
              <p className="text-xs text-gray-400">
                ¿No recibiste el correo? Revisa tu carpeta de spam o{" "}
                <button
                  onClick={() => setSent(false)}
                  className="text-[#1d4ed8] underline"
                >
                  intenta de nuevo
                </button>
                .
              </p>
            </div>
          )}

          <div className="mt-6 text-center">
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Volver al inicio de sesión
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
