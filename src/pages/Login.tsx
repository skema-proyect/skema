import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function Login() {
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-skema-bg flex items-center justify-center px-4">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="text-center mb-10">
          <p className="text-skema-accent font-inter font-semibold text-3xl tracking-widest">SKEMA</p>
          <p className="text-skema-muted text-[12px] tracking-wider mt-1">Asistente Personal de Dirección</p>
        </div>

        {/* Form */}
        <form onSubmit={handleLogin} className="bg-skema-surface border border-skema-border rounded-xl p-8 space-y-5">
          <div>
            <label className="block text-skema-muted text-[11px] tracking-wider uppercase mb-2">
              Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full bg-skema-bg border border-skema-border rounded-lg px-4 py-3 text-skema-text text-[13px] font-inter outline-none focus:border-skema-accent transition-colors"
              placeholder="tu@email.com"
            />
          </div>
          <div>
            <label className="block text-skema-muted text-[11px] tracking-wider uppercase mb-2">
              Contraseña
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full bg-skema-bg border border-skema-border rounded-lg px-4 py-3 text-skema-text text-[13px] font-inter outline-none focus:border-skema-accent transition-colors"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="text-skema-danger text-[12px] font-inter">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-skema-accent hover:bg-skema-accent-dark text-white font-inter text-[13px] font-medium py-3 rounded-lg transition-colors duration-200 disabled:opacity-50"
          >
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>

        <p className="text-center text-skema-muted text-[11px] mt-6">
          Acceso restringido · Solo usuarios autorizados
        </p>
      </div>
    </div>
  );
}
