import { useState } from "react";
import { supabase } from "@/lib/supabase";

type Tab = "login" | "register";

export default function AuthPage() {
  const [tab,      setTab]      = useState<Tab>("login");
  const [name,     setName]     = useState("");
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [code,     setCode]     = useState("");
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);

  const switchTab = (t: Tab) => { setTab(t); setError(""); };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError("Email o contraseña incorrectos");
    setLoading(false);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setLoading(true);

    const res  = await fetch("/api/register", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ email, password, name, code }),
    });
    const data = await res.json();

    if (!res.ok) {
      setError(data.error ?? "Error al crear la cuenta");
      setLoading(false);
      return;
    }

    // Auto-login after successful register
    const { error: loginErr } = await supabase.auth.signInWithPassword({ email, password });
    if (loginErr) setError(loginErr.message);
    setLoading(false);
  };

  const inputCls = "w-full border border-s-border rounded-xl px-4 py-3 text-[14px] text-s-text bg-transparent outline-none focus:border-s-text transition-colors placeholder:text-s-muted";

  return (
    <div className="min-h-screen bg-s-bg flex items-center justify-center px-4">
      <div className="w-full max-w-[360px]">

        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <img src="/logo-skema.png" alt="SKEMA" className="h-8 w-auto mb-2" />
          <p className="text-s-muted text-[13px]">Asistente de dirección</p>
        </div>

        {/* Tabs */}
        <div className="flex border border-s-border rounded-xl mb-6 overflow-hidden">
          <button
            onClick={() => switchTab("login")}
            className={`flex-1 py-2.5 text-[13px] font-medium transition-colors ${tab === "login" ? "bg-s-text text-white" : "text-s-muted hover:text-s-text"}`}
          >
            Iniciar sesión
          </button>
          <button
            onClick={() => switchTab("register")}
            className={`flex-1 py-2.5 text-[13px] font-medium transition-colors ${tab === "register" ? "bg-s-text text-white" : "text-s-muted hover:text-s-text"}`}
          >
            Crear cuenta
          </button>
        </div>

        {tab === "login" ? (
          <form onSubmit={handleLogin} className="space-y-3">
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="Email" required autoComplete="email"
              className={inputCls}
            />
            <input
              type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="Contraseña" required autoComplete="current-password"
              className={inputCls}
            />
            {error && <p className="text-s-danger text-[12px] px-1">{error}</p>}
            <button
              type="submit" disabled={loading}
              className="w-full bg-s-text text-white rounded-xl py-3 text-[14px] font-medium hover:opacity-80 transition-opacity disabled:opacity-40 mt-2"
            >
              {loading ? "Entrando…" : "Entrar"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleRegister} className="space-y-3">
            <input
              type="text" value={name} onChange={e => setName(e.target.value)}
              placeholder="Tu nombre" required autoComplete="name"
              className={inputCls}
            />
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="Email" required autoComplete="email"
              className={inputCls}
            />
            <input
              type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="Contraseña (mínimo 6 caracteres)" required minLength={6}
              autoComplete="new-password"
              className={inputCls}
            />
            <input
              type="text"
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase())}
              placeholder="Código de acceso"
              required
              autoComplete="off"
              className={`${inputCls} font-mono tracking-widest`}
            />
            {error && <p className="text-s-danger text-[12px] px-1">{error}</p>}
            <button
              type="submit" disabled={loading}
              className="w-full bg-s-text text-white rounded-xl py-3 text-[14px] font-medium hover:opacity-80 transition-opacity disabled:opacity-40 mt-2"
            >
              {loading ? "Creando cuenta…" : "Crear cuenta"}
            </button>
          </form>
        )}

        <p className="text-center text-[11px] text-s-muted mt-6">
          SKEMA v0.1 · Piloto
        </p>
      </div>
    </div>
  );
}
