import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Plus, Copy, Check, Trash2 } from "lucide-react";

interface InviteCode {
  id: string;
  code: string;
  notes: string | null;
  used: boolean;
  used_at: string | null;
  created_at: string;
}

function genCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const part  = (n: number) =>
    Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return `SKEMA-${part(4)}-${part(4)}`;
}

export default function AdminPage() {
  const [codes,    setCodes]    = useState<InviteCode[]>([]);
  const [notes,    setNotes]    = useState("");
  const [creating, setCreating] = useState(false);
  const [copied,   setCopied]   = useState<string | null>(null);
  const [loading,  setLoading]  = useState(true);

  const reload = async () => {
    const { data } = await supabase
      .from("invite_codes")
      .select("*")
      .order("created_at", { ascending: false });
    setCodes(data ?? []);
    setLoading(false);
  };

  useEffect(() => { reload(); }, []);

  const createCode = async () => {
    setCreating(true);
    const code = genCode();
    await supabase.from("invite_codes").insert({ code, notes: notes.trim() || null });
    setNotes("");
    await reload();
    setCreating(false);
  };

  const deleteCode = async (id: string) => {
    if (!confirm("¿Eliminar este código?")) return;
    await supabase.from("invite_codes").delete().eq("id", id);
    await reload();
  };

  const copy = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopied(code);
    setTimeout(() => setCopied(null), 2000);
  };

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });

  const active = codes.filter(c => !c.used).length;
  const used   = codes.filter(c => c.used).length;

  return (
    <div className="h-full overflow-y-auto bg-s-bg px-4 py-6 max-w-2xl mx-auto">

      <div className="mb-6">
        <h1 className="text-[18px] font-medium text-s-text">Panel de administración</h1>
        <p className="text-s-muted text-[13px] mt-1">
          {active} código{active !== 1 ? "s" : ""} activo{active !== 1 ? "s" : ""} · {used} usado{used !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Crear código */}
      <div className="border border-s-border rounded-xl p-4 mb-6">
        <p className="text-[13px] font-medium text-s-text mb-3">Nuevo código de acceso</p>
        <div className="flex gap-2">
          <input
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Para quién es (opcional, ej: Estudio García)"
            className="flex-1 border border-s-border rounded-lg px-3 py-2 text-[13px] text-s-text bg-transparent outline-none focus:border-s-text placeholder:text-s-muted"
          />
          <button
            onClick={createCode}
            disabled={creating}
            className="flex items-center gap-1.5 px-4 py-2 bg-s-text text-white rounded-lg text-[13px] hover:opacity-80 transition-opacity disabled:opacity-40"
          >
            <Plus size={14} />
            {creating ? "Generando…" : "Generar"}
          </button>
        </div>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="flex justify-center py-8">
          <div className="w-5 h-5 border-2 border-s-border border-t-s-text rounded-full animate-spin" />
        </div>
      ) : codes.length === 0 ? (
        <p className="text-center text-s-muted text-[13px] py-8">Sin códigos todavía</p>
      ) : (
        <div className="space-y-2">
          {codes.map(c => (
            <div
              key={c.id}
              className={`flex items-center gap-3 border rounded-xl px-4 py-3 ${c.used ? "border-s-border opacity-50" : "border-s-border"}`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[14px] text-s-text font-medium">{c.code}</span>
                  {c.used && (
                    <span className="text-[10px] px-1.5 py-0.5 bg-s-surface text-s-muted rounded">
                      Usado {c.used_at ? fmt(c.used_at) : ""}
                    </span>
                  )}
                </div>
                {c.notes && (
                  <p className="text-[12px] text-s-muted mt-0.5 truncate">{c.notes}</p>
                )}
                <p className="text-[11px] text-s-muted mt-0.5">Creado {fmt(c.created_at)}</p>
              </div>

              <div className="flex items-center gap-1">
                {!c.used && (
                  <button
                    onClick={() => copy(c.code)}
                    className="p-2 rounded-lg hover:bg-s-surface text-s-muted hover:text-s-text transition-colors"
                    title="Copiar código"
                  >
                    {copied === c.code ? <Check size={14} className="text-s-success" /> : <Copy size={14} />}
                  </button>
                )}
                <button
                  onClick={() => deleteCode(c.id)}
                  className="p-2 rounded-lg hover:bg-s-surface text-s-muted hover:text-s-danger transition-colors"
                  title="Eliminar"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
