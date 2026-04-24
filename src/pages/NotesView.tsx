import { useState, useEffect, useRef } from "react";
import { Plus, Trash2, Search } from "lucide-react";
import { notes as notesDB } from "@/lib/storage";
import type { Note } from "@/types";

export default function NotesView() {
  const [allNotes,   setAllNotes]   = useState<Note[]>([]);
  const [activeId,   setActiveId]   = useState<string | null>(null);
  const [search,     setSearch]     = useState("");
  const titleRef   = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLTextAreaElement>(null);

  const reload = () => setAllNotes(notesDB.getAll());

  useEffect(() => { reload(); }, []);

  const active = allNotes.find(n => n.id === activeId) ?? null;

  const filtered = allNotes.filter(n =>
    n.title.toLowerCase().includes(search.toLowerCase()) ||
    n.content.toLowerCase().includes(search.toLowerCase())
  );

  const createNote = () => {
    const n = notesDB.create();
    reload();
    setActiveId(n.id);
    setTimeout(() => titleRef.current?.focus(), 50);
  };

  const deleteNote = (id: string) => {
    if (!confirm("¿Eliminar esta nota?")) return;
    notesDB.delete(id);
    if (activeId === id) setActiveId(null);
    reload();
  };

  const updateTitle = (val: string) => {
    if (!activeId) return;
    notesDB.update(activeId, { title: val || "Sin título" });
    reload();
  };

  const updateContent = (val: string) => {
    if (!activeId) return;
    notesDB.update(activeId, { content: val });
    reload();
  };

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });

  return (
    <div className="flex h-full bg-s-bg overflow-hidden">

      {/* Left panel — notes list */}
      <div className="w-72 flex-shrink-0 border-r border-s-border flex flex-col">

        {/* Header */}
        <div className="px-4 py-4 border-b border-s-border">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-s-text font-medium text-[14px]">Notas</h2>
            <button
              onClick={createNote}
              className="p-1.5 rounded-lg hover:bg-s-surface text-s-muted hover:text-s-text transition-colors"
              title="Nueva nota"
            >
              <Plus size={16} />
            </button>
          </div>
          <div className="flex items-center gap-2 bg-s-surface border border-s-border rounded-lg px-3 py-1.5">
            <Search size={13} className="text-s-muted flex-shrink-0" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar notas..."
              className="flex-1 bg-transparent text-[12px] text-s-text placeholder:text-s-muted outline-none"
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 && (
            <div className="px-4 py-8 text-center">
              <p className="text-s-muted text-[12px]">
                {search ? "Sin resultados" : "Sin notas. Crea una."}
              </p>
            </div>
          )}
          {filtered.map(n => (
            <div
              key={n.id}
              onClick={() => setActiveId(n.id)}
              className={`px-4 py-3 border-b border-s-border cursor-pointer group transition-colors ${
                activeId === n.id ? "bg-s-surface" : "hover:bg-s-surface/50"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-s-text truncate">{n.title}</p>
                  <p className="text-[11px] text-s-muted mt-0.5 line-clamp-2 leading-relaxed">
                    {n.content || "Sin contenido"}
                  </p>
                  <p className="text-[10px] text-s-muted mt-1">{fmt(n.updatedAt)}</p>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); deleteNote(n.id); }}
                  className="hidden group-hover:flex p-1 rounded hover:bg-s-border text-s-muted hover:text-s-danger mt-0.5 flex-shrink-0"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right panel — editor */}
      {active ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="px-8 py-4 border-b border-s-border flex items-center justify-between">
            <input
              ref={titleRef}
              key={active.id + "-title"}
              defaultValue={active.title === "Sin título" ? "" : active.title}
              onChange={e => updateTitle(e.target.value)}
              placeholder="Título"
              className="text-[18px] font-medium text-s-text bg-transparent outline-none flex-1 placeholder:text-s-muted"
            />
            <span className="text-[11px] text-s-muted ml-4 flex-shrink-0">
              Editado {fmt(active.updatedAt)}
            </span>
          </div>
          <textarea
            ref={contentRef}
            key={active.id + "-content"}
            defaultValue={active.content}
            onChange={e => updateContent(e.target.value)}
            placeholder="Empieza a escribir..."
            className="flex-1 px-8 py-5 text-[14px] text-s-text bg-transparent outline-none resize-none leading-relaxed placeholder:text-s-muted"
          />
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-center px-8">
          <div>
            <p className="text-s-muted text-[14px] mb-3">Selecciona una nota o crea una nueva</p>
            <button
              onClick={createNote}
              className="inline-flex items-center gap-2 px-4 py-2 border border-s-border rounded-lg text-[13px] text-s-muted hover:text-s-text hover:border-s-text transition-colors"
            >
              <Plus size={14} /> Nueva nota
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
