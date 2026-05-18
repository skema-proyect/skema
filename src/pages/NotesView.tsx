import { useState, useEffect, useRef } from "react";
import { Plus, Search, ArrowLeft, Trash2 } from "lucide-react";
import { notes as notesDB } from "@/lib/db";
import type { Note } from "@/types";

export default function NotesView() {
  const [allNotes,  setAllNotes]  = useState<Note[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search,    setSearch]    = useState("");
  const titleRef   = useRef<HTMLInputElement>(null);
  const saveTimer  = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const reload = async () => setAllNotes(await notesDB.getAll());
  useEffect(() => { reload(); }, []);

  const editing = allNotes.find(n => n.id === editingId) ?? null;
  const filtered = allNotes.filter(n =>
    n.title.toLowerCase().includes(search.toLowerCase()) ||
    n.content.toLowerCase().includes(search.toLowerCase())
  );

  const createNote = async () => {
    const n = await notesDB.create();
    await reload();
    setEditingId(n.id);
    setTimeout(() => titleRef.current?.focus(), 80);
  };

  const openNote = (id: string) => {
    setEditingId(id);
    setSearch("");
  };

  const goBack = () => { setEditingId(null); reload(); };

  const debouncedSave = (updates: Partial<Pick<Note, "title" | "content">>) => {
    if (!editingId) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      notesDB.update(editingId, updates).then(reload);
    }, 500);
  };

  const deleteNote = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!confirm("¿Eliminar esta nota?")) return;
    await notesDB.delete(id);
    if (editingId === id) setEditingId(null);
    await reload();
  };

  const fmt = (iso: string) => {
    const d    = new Date(iso);
    const diff = Date.now() - d.getTime();
    if (diff < 86_400_000)     return d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
    if (diff < 86_400_000 * 7) return d.toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" });
    return d.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
  };

  // ── Editor ───────────────────────────────────────────────────────────────────
  if (editing) {
    return (
      <div className="flex flex-col h-full bg-s-bg">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-s-border flex-shrink-0">
          <button onClick={goBack}
            className="flex items-center gap-1.5 text-s-muted hover:text-s-text transition-colors">
            <ArrowLeft size={17} />
            <span className="text-[14px]">Notas</span>
          </button>
          <div className="flex items-center gap-1">
            <span className="text-[11px] text-s-muted">{fmt(editing.updatedAt)}</span>
            <button onClick={() => deleteNote(editing.id)}
              className="ml-3 p-1.5 rounded hover:bg-s-surface text-s-muted hover:text-s-danger transition-colors">
              <Trash2 size={15} />
            </button>
          </div>
        </div>

        {/* Title */}
        <input
          ref={titleRef}
          key={editing.id + "-title"}
          defaultValue={editing.title === "Sin título" ? "" : editing.title}
          onChange={e => debouncedSave({ title: e.target.value || "Sin título" })}
          placeholder="Título"
          className="px-6 pt-5 pb-2 text-[22px] font-semibold text-s-text bg-transparent outline-none placeholder:text-s-muted flex-shrink-0"
        />

        {/* Content */}
        <textarea
          key={editing.id + "-content"}
          defaultValue={editing.content}
          onChange={e => debouncedSave({ content: e.target.value })}
          placeholder="Empieza a escribir..."
          className="flex-1 px-6 py-2 text-[15px] text-s-text bg-transparent outline-none resize-none leading-relaxed placeholder:text-s-muted"
        />
      </div>
    );
  }

  // ── Grid ─────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-s-bg overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-s-border flex-shrink-0">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-[18px] font-semibold text-s-text">Notas</h1>
          <button onClick={createNote}
            className="w-8 h-8 rounded-full bg-s-text text-s-bg flex items-center justify-center hover:opacity-80 transition-opacity"
            title="Nueva nota">
            <Plus size={16} />
          </button>
        </div>
        <div className="flex items-center gap-2 bg-s-surface border border-s-border rounded-xl px-3 py-2">
          <Search size={14} className="text-s-muted flex-shrink-0" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar notas..."
            className="flex-1 bg-transparent text-[14px] text-s-text placeholder:text-s-muted outline-none"
          />
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full pb-16">
            <p className="text-s-muted text-[14px] mb-4">
              {search ? "Sin resultados" : "Aún no tienes notas"}
            </p>
            {!search && (
              <button onClick={createNote}
                className="flex items-center gap-2 px-4 py-2 border border-s-border rounded-xl text-[13px] text-s-muted hover:text-s-text hover:border-s-text transition-colors">
                <Plus size={14} /> Nueva nota
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map(n => (
              <div key={n.id} onClick={() => openNote(n.id)}
                className="relative bg-s-surface border border-s-border rounded-2xl p-4 cursor-pointer hover:border-s-text transition-colors group min-h-[120px] flex flex-col">
                <p className="text-[14px] font-semibold text-s-text mb-1.5 line-clamp-1">{n.title}</p>
                <p className="text-[12px] text-s-muted leading-relaxed flex-1 line-clamp-4">
                  {n.content || "Sin contenido"}
                </p>
                <p className="text-[11px] text-s-muted mt-3">{fmt(n.updatedAt)}</p>
                <button
                  onClick={e => deleteNote(n.id, e)}
                  className="absolute top-3 right-3 hidden group-hover:flex p-1 rounded-lg hover:bg-s-border text-s-muted hover:text-s-danger transition-colors">
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
