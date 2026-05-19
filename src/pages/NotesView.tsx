import { useState, useEffect, useRef } from "react";
import { Plus, Search, ArrowLeft, Trash2, Bold, Italic, Underline as UnderlineIcon } from "lucide-react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Color } from "@tiptap/extension-color";
import { TextStyle } from "@tiptap/extension-text-style";
import Underline from "@tiptap/extension-underline";
import { notes as notesDB } from "@/lib/db";
import type { Note } from "@/types";

const stripHtml = (html: string) =>
  html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

const TEXT_COLORS = [
  { label: "Normal", value: "" },
  { label: "Rojo",   value: "#dc2626" },
  { label: "Azul",   value: "#2563eb" },
  { label: "Verde",  value: "#16a34a" },
  { label: "Naranja",value: "#d97706" },
  { label: "Morado", value: "#7c3aed" },
];

export default function NotesView() {
  const [allNotes,  setAllNotes]  = useState<Note[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search,    setSearch]    = useState("");

  const reload = async () => setAllNotes(await notesDB.getAll());
  useEffect(() => { reload(); }, []);

  const editing = allNotes.find(n => n.id === editingId) ?? null;
  const filtered = allNotes.filter(n => {
    const text = stripHtml(n.content).toLowerCase();
    const q = search.toLowerCase();
    return n.title.toLowerCase().includes(q) || text.includes(q);
  });

  const createNote = async () => {
    const n = await notesDB.create();
    await reload();
    setEditingId(n.id);
  };

  const openNote = (id: string) => { setEditingId(id); setSearch(""); };
  const goBack   = () => { setEditingId(null); reload(); };

  const deleteNote = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!confirm("¿Eliminar esta nota?")) return;
    await notesDB.delete(id);
    if (editingId === id) setEditingId(null);
    await reload();
  };

  const fmt = (iso: string) => {
    const d = new Date(iso), diff = Date.now() - d.getTime();
    if (diff < 86_400_000)     return d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
    if (diff < 86_400_000 * 7) return d.toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" });
    return d.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
  };

  if (editing) {
    return <NoteEditor key={editing.id} note={editing} onBack={goBack} onDelete={deleteNote} fmt={fmt} />;
  }

  return (
    <div className="flex flex-col h-full bg-s-bg overflow-hidden">
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
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar notas..."
            className="flex-1 bg-transparent text-[14px] text-s-text placeholder:text-s-muted outline-none" />
        </div>
      </div>

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
                  {stripHtml(n.content) || "Sin contenido"}
                </p>
                <p className="text-[11px] text-s-muted mt-3">{fmt(n.updatedAt)}</p>
                <button onClick={e => deleteNote(n.id, e)}
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

// ── Editor de nota con Tiptap ─────────────────────────────────────────────────

function NoteEditor({ note, onBack, onDelete, fmt }: {
  note: Note;
  onBack: () => void;
  onDelete: (id: string) => Promise<void>;
  fmt: (iso: string) => string;
}) {
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const titleRef  = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState(note.title === "Sin título" ? "" : note.title);

  const editor = useEditor({
    extensions: [
      StarterKit,
      TextStyle,
      Color,
      Underline,
    ],
    content: note.content || "",
    editorProps: {
      attributes: {
        class: "outline-none min-h-[200px] text-[15px] leading-relaxed text-s-text prose prose-sm max-w-none",
      },
    },
    onUpdate: ({ editor }) => {
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        notesDB.update(note.id, { content: editor.getHTML() });
      }, 500);
    },
  });

  // Auto-focus title on new note
  useEffect(() => {
    if (note.title === "Sin título") setTimeout(() => titleRef.current?.focus(), 80);
  }, []);

  const saveTitle = (val: string) => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      notesDB.update(note.id, { title: val || "Sin título" });
    }, 500);
  };

  const setColor = (color: string) => {
    if (!editor) return;
    if (!color) editor.chain().focus().unsetColor().run();
    else editor.chain().focus().setColor(color).run();
  };

  return (
    <div className="flex flex-col h-full bg-s-bg">
      {/* Toolbar superior */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-s-border flex-shrink-0">
        <button onClick={onBack}
          className="flex items-center gap-1.5 text-s-muted hover:text-s-text transition-colors">
          <ArrowLeft size={17} />
          <span className="text-[14px]">Notas</span>
        </button>
        <div className="flex items-center gap-1">
          <span className="text-[11px] text-s-muted">{fmt(note.updatedAt)}</span>
          <button onClick={() => onDelete(note.id)}
            className="ml-3 p-1.5 rounded hover:bg-s-surface text-s-muted hover:text-s-danger transition-colors">
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      {/* Título */}
      <input
        ref={titleRef}
        value={title}
        onChange={e => { setTitle(e.target.value); saveTitle(e.target.value); }}
        placeholder="Título"
        className="px-6 pt-5 pb-2 text-[22px] font-semibold text-s-text bg-transparent outline-none placeholder:text-s-muted flex-shrink-0"
      />

      {/* Barra de formato */}
      <div className="flex items-center gap-1 px-6 py-2 border-b border-s-border flex-shrink-0 flex-wrap">
        {/* Negrita */}
        <button
          onClick={() => editor?.chain().focus().toggleBold().run()}
          className={`p-1.5 rounded text-[13px] font-bold transition-colors ${editor?.isActive("bold") ? "bg-s-surface text-s-text" : "text-s-muted hover:text-s-text hover:bg-s-surface"}`}
          title="Negrita">
          <Bold size={14} />
        </button>
        {/* Cursiva */}
        <button
          onClick={() => editor?.chain().focus().toggleItalic().run()}
          className={`p-1.5 rounded transition-colors ${editor?.isActive("italic") ? "bg-s-surface text-s-text" : "text-s-muted hover:text-s-text hover:bg-s-surface"}`}
          title="Cursiva">
          <Italic size={14} />
        </button>
        {/* Subrayado */}
        <button
          onClick={() => editor?.chain().focus().toggleUnderline().run()}
          className={`p-1.5 rounded transition-colors ${editor?.isActive("underline") ? "bg-s-surface text-s-text" : "text-s-muted hover:text-s-text hover:bg-s-surface"}`}
          title="Subrayado">
          <UnderlineIcon size={14} />
        </button>

        <div className="w-px h-4 bg-s-border mx-1" />

        {/* H1 */}
        <button
          onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
          className={`px-2 py-1 rounded text-[11px] font-bold transition-colors ${editor?.isActive("heading", { level: 1 }) ? "bg-s-surface text-s-text" : "text-s-muted hover:text-s-text hover:bg-s-surface"}`}
          title="Título grande">
          H1
        </button>
        {/* H2 */}
        <button
          onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
          className={`px-2 py-1 rounded text-[11px] font-bold transition-colors ${editor?.isActive("heading", { level: 2 }) ? "bg-s-surface text-s-text" : "text-s-muted hover:text-s-text hover:bg-s-surface"}`}
          title="Título mediano">
          H2
        </button>

        <div className="w-px h-4 bg-s-border mx-1" />

        {/* Colores */}
        {TEXT_COLORS.map(c => (
          <button
            key={c.value}
            onClick={() => setColor(c.value)}
            title={c.label}
            className="w-5 h-5 rounded-full border border-s-border/50 hover:scale-110 transition-transform flex-shrink-0"
            style={{ backgroundColor: c.value || "transparent" }}
          >
            {!c.value && <span className="text-[9px] text-s-muted leading-none flex items-center justify-center h-full">A</span>}
          </button>
        ))}
      </div>

      {/* Contenido */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
