import { useState } from "react";
import { ArrowLeft, Check } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

function getInitials(name: string | null, email: string): string {
  if (name?.trim()) {
    const parts = name.trim().split(/\s+/);
    return parts.length >= 2
      ? (parts[0][0] + parts[1][0]).toUpperCase()
      : parts[0].slice(0, 2).toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

export { getInitials };

export default function UserPanel({ onClose }: { onClose: () => void }) {
  const { profile, signOut, refreshProfile } = useAuth();

  const [name,         setName]         = useState(profile?.name ?? "");
  const [instructions, setInstructions] = useState(profile?.instructions ?? "");
  const [saving,       setSaving]       = useState(false);
  const [saved,        setSaved]        = useState(false);
  const [resetSent,    setResetSent]    = useState(false);

  if (!profile) return null;

  const initials = getInitials(profile.name, profile.email);

  const save = async () => {
    setSaving(true);
    await supabase.from("profiles")
      .update({ name: name.trim() || null, instructions: instructions.trim() || null })
      .eq("id", profile.id);
    await refreshProfile();
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const resetPassword = async () => {
    await supabase.auth.resetPasswordForEmail(profile.email, {
      redirectTo: window.location.origin,
    });
    setResetSent(true);
  };

  return (
    <div className="fixed inset-0 z-[100] bg-s-bg overflow-y-auto">
      <div className="max-w-lg mx-auto px-4 pt-4 pb-16">

        {/* Back */}
        <button onClick={onClose}
          className="flex items-center gap-2 text-s-muted hover:text-s-text transition-colors mb-6">
          <ArrowLeft size={17} />
          <span className="text-[14px]">Volver</span>
        </button>

        {/* Avatar + nombre */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-full bg-blue-500 flex items-center justify-center text-white text-[22px] font-semibold mb-3 select-none">
            {initials}
          </div>
          <p className="text-[17px] font-medium text-s-text">{profile.name ?? profile.email}</p>
        </div>

        {/* Mi SKEMA */}
        <PanelSection label="Mi SKEMA">
          <PanelItem label="Personalización">
            <p className="text-[12px] text-s-muted mb-2 leading-relaxed">
              Instrucciones generales que SKEMA aplica en todas tus conversaciones — tu rol, contexto habitual, preferencias de respuesta.
            </p>
            <textarea
              value={instructions}
              onChange={e => setInstructions(e.target.value)}
              placeholder={"Ej: Soy arquitecto en Canarias. Mis proyectos son principalmente residenciales. Respóndeme de forma directa y técnica, sin introducciones largas."}
              rows={6}
              className="w-full bg-s-bg border border-s-border rounded-xl px-3 py-2.5 text-[14px] text-s-text placeholder:text-s-muted outline-none focus:border-s-text transition-colors resize-none leading-relaxed"
            />
          </PanelItem>
        </PanelSection>

        {/* Cuenta */}
        <PanelSection label="Cuenta">
          <PanelItem label="Nombre">
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Tu nombre"
              className="w-full bg-s-bg border border-s-border rounded-xl px-3 py-2.5 text-[14px] text-s-text outline-none focus:border-s-text transition-colors"
            />
          </PanelItem>
          <PanelItem label="Correo electrónico">
            <p className="text-[14px] text-s-muted">{profile.email}</p>
          </PanelItem>
          <PanelItem label="Contraseña">
            {resetSent ? (
              <div className="flex items-center gap-1.5 text-[13px] text-s-muted">
                <Check size={13} className="text-green-600" />
                Email enviado — revisa tu correo
              </div>
            ) : (
              <button onClick={resetPassword}
                className="text-[13px] text-s-muted hover:text-s-text underline underline-offset-2 transition-colors">
                Enviar email para cambiar contraseña
              </button>
            )}
          </PanelItem>
        </PanelSection>

        {/* Ajustes */}
        <PanelSection label="Ajustes">
          <PanelItem>
            <p className="text-[12px] text-s-muted">SKEMA v0.1</p>
            <p className="text-[11px] text-s-muted/60 mt-1">
              Desarrollado por{" "}
              <a href="https://www.ai-connect.es" target="_blank" rel="noopener noreferrer"
                className="hover:text-s-muted transition-colors">
                AI-CONNECT
              </a>
            </p>
          </PanelItem>
        </PanelSection>

        {/* Acciones */}
        <div className="mt-6 space-y-3">
          <button onClick={save} disabled={saving}
            className="w-full py-3 rounded-xl bg-s-text text-s-bg text-[14px] font-medium hover:opacity-80 disabled:opacity-40 transition-opacity flex items-center justify-center gap-2">
            {saved
              ? <><Check size={15} /> Guardado</>
              : saving ? "Guardando..." : "Guardar cambios"}
          </button>
          <button onClick={signOut}
            className="w-full py-3 rounded-xl border border-s-border text-[14px] text-s-muted hover:text-red-500 hover:border-red-400 transition-colors">
            Cerrar sesión
          </button>
        </div>

      </div>
    </div>
  );
}

function PanelSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <p className="text-[11px] uppercase tracking-widest text-s-muted font-medium mb-2 px-1">{label}</p>
      <div className="bg-s-surface border border-s-border rounded-xl divide-y divide-s-border overflow-hidden">
        {children}
      </div>
    </div>
  );
}

function PanelItem({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <div className="px-4 py-3">
      {label && <p className="text-[11px] text-s-muted mb-1.5 uppercase tracking-wide">{label}</p>}
      {children}
    </div>
  );
}
