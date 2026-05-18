import { useState, useEffect } from "react";
import { useParams, useNavigate, useOutletContext } from "react-router-dom";
import { FolderOpen, MoreHorizontal, Plus, Trash2, X } from "lucide-react";
import { projects as projectsDB, conversations as convsDB } from "@/lib/db";
import type { Project, Conversation } from "@/types";

interface OutletCtx {
  setCurrentConvId: (id: string) => void;
  bump: () => void;
}

export default function ProjectView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { setCurrentConvId, bump } = useOutletContext<OutletCtx>();

  const [project,  setProject]  = useState<Project | null>(null);
  const [convs,    setConvs]    = useState<Conversation[]>([]);
  const [settings, setSettings] = useState(false);
  const [editName, setEditName] = useState("");
  const [editInstr, setEditInstr] = useState("");

  const load = async () => {
    if (!id) return;
    const all = await projectsDB.getAll();
    const p = all.find(p => p.id === id);
    if (!p) { navigate("/"); return; }
    setProject(p);
    setEditName(p.name);
    setEditInstr(p.instructions ?? "");
    const allConvs = await convsDB.getAll();
    setConvs(allConvs.filter(c => c.projectId === id));
  };

  useEffect(() => { load(); }, [id]);

  const openChat = (convId: string) => {
    setCurrentConvId(convId);
    navigate("/");
  };

  const newChat = async () => {
    if (!id) return;
    const conv = await convsDB.create("Nueva conversación", id);
    setCurrentConvId(conv.id);
    bump();
    navigate("/");
  };

  const saveSettings = async () => {
    if (!id || !project) return;
    await projectsDB.update(id, {
      name:         editName.trim() || project.name,
      instructions: editInstr,
    });
    setSettings(false);
    bump();
    load();
  };

  const deleteProject = async () => {
    if (!id || !confirm("¿Eliminar proyecto? Las conversaciones quedarán sin asignar.")) return;
    await projectsDB.delete(id);
    bump();
    navigate("/");
  };

  const fmt = (iso: string) => {
    const d    = new Date(iso);
    const diff = Date.now() - d.getTime();
    if (diff < 86_400_000)     return d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
    if (diff < 86_400_000 * 7) return d.toLocaleDateString("es-ES", { weekday: "short" });
    return d.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
  };

  if (!project) return null;

  return (
    <div className="relative flex flex-col h-full bg-s-bg overflow-hidden">

      {/* Top bar */}
      <div className="flex items-center justify-end px-6 py-3 border-b border-s-border flex-shrink-0">
        <button
          onClick={() => setSettings(true)}
          className="p-2 rounded-lg hover:bg-s-surface text-s-muted hover:text-s-text transition-colors"
          title="Configuración del proyecto"
        >
          <MoreHorizontal size={18} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto w-full px-6 py-8">

          {/* Project title */}
          <div className="flex items-center gap-3 mb-8">
            <FolderOpen size={28} className="text-s-muted flex-shrink-0" />
            <h1 className="text-[28px] font-semibold text-s-text tracking-tight">{project.name.toUpperCase()}</h1>
          </div>

          {/* New chat button */}
          <button
            onClick={newChat}
            className="w-full flex items-center gap-3 px-5 py-3.5 border border-s-border rounded-full bg-s-surface hover:border-s-text transition-colors mb-8 text-left"
          >
            <Plus size={16} className="text-s-muted flex-shrink-0" />
            <span className="text-s-muted text-[15px]">Nuevo chat en {project.name}</span>
          </button>

          {/* Conversation list */}
          {convs.length === 0 ? (
            <p className="text-center text-s-muted text-[14px] py-10">
              Sin conversaciones aún. Crea el primero.
            </p>
          ) : (
            <div>
              {convs.map(c => {
                const lastMsg = c.messages?.[c.messages.length - 1];
                const preview = lastMsg?.content?.replace(/\n/g, " ").trim().slice(0, 80) ?? "";
                return (
                  <button key={c.id} onClick={() => openChat(c.id)}
                    className="w-full flex items-start justify-between gap-4 px-2 py-3.5 border-b border-s-border hover:bg-s-surface rounded-lg transition-colors text-left">
                    <div className="flex-1 min-w-0">
                      <p className="text-[15px] font-medium text-s-text truncate">{c.title}</p>
                      {preview && (
                        <p className="text-[13px] text-s-muted truncate mt-0.5">{preview}</p>
                      )}
                    </div>
                    <span className="text-[12px] text-s-muted flex-shrink-0 mt-0.5">{fmt(c.updatedAt)}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Settings modal */}
      {settings && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => setSettings(false)}
        >
          <div
            className="bg-s-bg border border-s-border rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-[16px] font-semibold text-s-text">Configuración del proyecto</h2>
              <button onClick={() => setSettings(false)}
                className="p-1 rounded hover:bg-s-surface text-s-muted hover:text-s-text transition-colors">
                <X size={16} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-[11px] text-s-muted uppercase tracking-wider mb-1.5">Nombre</label>
                <input
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  className="w-full bg-s-surface border border-s-border rounded-lg px-3 py-2 text-[14px] text-s-text outline-none focus:border-s-text transition-colors"
                />
              </div>
              <div>
                <label className="block text-[11px] text-s-muted uppercase tracking-wider mb-1.5">Instrucciones</label>
                <textarea
                  value={editInstr}
                  onChange={e => setEditInstr(e.target.value)}
                  placeholder="Ej: Este proyecto es una vivienda unifamiliar en Las Palmas. Ten en cuenta el CTE y el PGOU..."
                  rows={5}
                  className="w-full bg-s-surface border border-s-border rounded-lg px-3 py-2 text-[14px] text-s-text outline-none focus:border-s-text resize-none placeholder:text-s-muted leading-relaxed transition-colors"
                />
              </div>
            </div>

            <div className="flex items-center justify-between mt-6">
              <button onClick={deleteProject}
                className="flex items-center gap-1.5 text-[13px] text-s-danger hover:opacity-70 transition-opacity">
                <Trash2 size={13} /> Eliminar proyecto
              </button>
              <div className="flex gap-2">
                <button onClick={() => setSettings(false)}
                  className="px-4 py-2 text-[13px] text-s-muted hover:text-s-text border border-s-border rounded-lg transition-colors">
                  Cancelar
                </button>
                <button onClick={saveSettings}
                  className="px-4 py-2 text-[13px] bg-s-text text-s-bg rounded-lg hover:opacity-80 transition-opacity font-medium">
                  Guardar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
