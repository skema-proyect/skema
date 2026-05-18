import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Plus, ChevronDown, ChevronRight,
  MessageSquare, FolderOpen, Trash2,
  StickyNote, Calendar, PenLine, X, Download,
  LogOut, ShieldCheck, FolderInput,
} from "lucide-react";
import { projects as projectsDB, conversations as convsDB } from "@/lib/db";
import { SERVICES } from "@/constants/services";
import { useAuth } from "@/lib/auth";
import type { Project, Conversation } from "@/types";

interface Props {
  currentConvId: string | null;
  onSelectConv:    (id: string) => void;
  onNewChat:       () => void;
  onServiceSelect: (prompt: string) => void;
  onClose?:        () => void;
  refresh:         number;
}

export default function Sidebar({ currentConvId, onSelectConv, onNewChat, onServiceSelect, onClose, refresh }: Props) {
  const navigate  = useNavigate();
  const location  = useLocation();
  const { profile, signOut } = useAuth();

  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [allConvs,    setAllConvs]    = useState<Conversation[]>([]);
  const [expanded,    setExpanded]    = useState<Record<string, boolean>>({});
  const [renaming,    setRenaming]    = useState<string | null>(null);
  const [nameVal,     setNameVal]     = useState("");
  const [newProj,     setNewProj]     = useState(false);
  const [newName,     setNewName]     = useState("");
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed,     setInstalled]     = useState(false);
  const isStandalone = typeof window !== "undefined" && window.matchMedia("(display-mode: standalone)").matches;

  useEffect(() => {
    const handler = (e: Event) => { e.preventDefault(); setInstallPrompt(e as BeforeInstallPromptEvent); };
    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", () => setInstalled(true));
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  useEffect(() => {
    projectsDB.getAll().then(setAllProjects);
    convsDB.getAll().then(setAllConvs);
  }, [refresh]);

  const handleInstall = async () => {
    if (installPrompt) {
      installPrompt.prompt();
      const { outcome } = await installPrompt.userChoice;
      if (outcome === "accepted") setInstalled(true);
    } else {
      alert("Toca el menú del navegador (⋮) y selecciona 'Añadir a pantalla de inicio'");
    }
  };

  const loose = allConvs.filter(c => !c.projectId);

  const toggleProject = (id: string) =>
    setExpanded(e => ({ ...e, [id]: !e[id] }));

  const createProject = async () => {
    if (!newName.trim()) return;
    await projectsDB.create(newName.trim());
    setNewName(""); setNewProj(false);
    projectsDB.getAll().then(setAllProjects);
  };

  const deleteProject = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (confirm("¿Eliminar proyecto? Las conversaciones quedarán sin asignar.")) {
      await projectsDB.delete(id);
      projectsDB.getAll().then(setAllProjects);
      convsDB.getAll().then(setAllConvs);
    }
  };

  const startRename = (e: React.MouseEvent, p: Project) => {
    e.stopPropagation();
    setRenaming(p.id); setNameVal(p.name);
  };

  const confirmRename = async (id: string) => {
    if (nameVal.trim()) await projectsDB.rename(id, nameVal.trim());
    setRenaming(null);
    projectsDB.getAll().then(setAllProjects);
  };

  const deleteConv = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await convsDB.delete(id);
    if (currentConvId === id) onNewChat();
    convsDB.getAll().then(setAllConvs);
  };

  const moveConv = async (convId: string, projectId: string | null) => {
    await convsDB.assignProject(convId, projectId);
    convsDB.getAll().then(setAllConvs);
  };

  const goTo = (path: string) => { navigate(path); onClose?.(); };
  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="flex flex-col h-full bg-s-sidebar text-s-sidebar-text select-none relative">

      {/* Header */}
      <div className="flex items-center justify-between px-3 pt-4 pb-3 border-b border-s-sidebar-border">
        <button
          onClick={() => { onNewChat(); onClose?.(); }}
          className="flex items-center gap-2 px-2 hover:opacity-70 transition-opacity"
          title="Nuevo chat"
        >
          <img src="/logo-skema.png" alt="SKEMA" className="h-6 w-auto" style={{ filter: "invert(1)" }} />
        </button>
        {onClose && (
          <button onClick={onClose} className="p-1.5 rounded hover:bg-s-sidebar-hover text-s-sidebar-muted lg:hidden">
            <X size={17} />
          </button>
        )}
      </div>

      {/* Servicios rápidos */}
      <div className="px-3 py-3 border-b border-s-sidebar-border">
        <p className="text-[12px] uppercase tracking-widest text-s-sidebar-muted mb-2 px-1">Servicios</p>
        <div className="space-y-0.5">
          {SERVICES.map(({ icon: Icon, label, prompt }) => (
            <button
              key={label}
              onClick={() => { onServiceSelect(prompt); onClose?.(); }}
              className="w-full flex items-center gap-2.5 px-2 py-2.5 rounded text-[15px] text-s-sidebar-muted hover:bg-s-sidebar-hover hover:text-s-sidebar-text transition-colors text-left"
            >
              <Icon size={13} className="flex-shrink-0" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-2 py-3 space-y-4">

        {/* Projects */}
        <div>
          <div className="flex items-center justify-between px-2 mb-1">
            <span className="text-[12px] uppercase tracking-widest text-s-sidebar-muted font-medium">Proyectos</span>
            <button onClick={() => setNewProj(v => !v)} className="p-0.5 rounded hover:bg-s-sidebar-hover text-s-sidebar-muted">
              <Plus size={13} />
            </button>
          </div>

          {newProj && (
            <div className="px-2 mb-2">
              <input
                autoFocus value={newName} onChange={e => setNewName(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") createProject(); if (e.key === "Escape") setNewProj(false); }}
                placeholder="Nombre del proyecto"
                className="w-full bg-s-sidebar-hover text-s-sidebar-text text-[15px] px-2 py-1.5 rounded outline-none placeholder:text-s-sidebar-muted"
              />
            </div>
          )}

          {allProjects.length === 0 && !newProj && (
            <p className="px-2 text-[14px] text-s-sidebar-muted italic">Sin proyectos</p>
          )}

          {allProjects.map(p => {
            const convs = allConvs.filter(c => c.projectId === p.id);
            const open  = expanded[p.id];
            return (
              <div key={p.id}>
                <div
                  className="flex items-center gap-1.5 px-2 py-1.5 rounded hover:bg-s-sidebar-hover cursor-pointer group"
                  onClick={() => toggleProject(p.id)}
                >
                  {open
                    ? <ChevronDown  size={13} className="text-s-sidebar-muted flex-shrink-0" />
                    : <ChevronRight size={13} className="text-s-sidebar-muted flex-shrink-0" />}
                  <FolderOpen size={13} className="text-s-sidebar-muted flex-shrink-0" />
                  {renaming === p.id ? (
                    <input
                      autoFocus value={nameVal} onChange={e => setNameVal(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") confirmRename(p.id); if (e.key === "Escape") setRenaming(null); }}
                      onBlur={() => confirmRename(p.id)}
                      className="flex-1 bg-transparent text-s-sidebar-text text-[12px] outline-none border-b border-s-sidebar-muted"
                      onClick={e => e.stopPropagation()}
                    />
                  ) : (
                    <span className="flex-1 text-[15px] truncate">{p.name}</span>
                  )}
                  <div className="hidden group-hover:flex items-center gap-0.5">
                    <button onClick={e => startRename(e, p)} className="p-0.5 rounded hover:bg-white/10"><PenLine size={11} /></button>
                    <button onClick={e => deleteProject(e, p.id)} className="p-0.5 rounded hover:bg-white/10 text-s-danger"><Trash2 size={11} /></button>
                  </div>
                  <span className="text-[10px] text-s-sidebar-muted">{convs.length}</span>
                </div>
                {open && convs.map(c => (
                  <ConvItem key={c.id} conv={c} active={currentConvId === c.id}
                    onSelect={() => { onSelectConv(c.id); navigate("/"); onClose?.(); }}
                    onDelete={deleteConv} onMove={moveConv}
                    projects={allProjects} indent
                  />
                ))}
              </div>
            );
          })}
        </div>

        {/* Loose conversations */}
        {loose.length > 0 && (
          <div>
            <p className="px-2 text-[12px] uppercase tracking-widest text-s-sidebar-muted font-medium mb-1">Recientes</p>
            {loose.map(c => (
              <ConvItem key={c.id} conv={c} active={currentConvId === c.id}
                onSelect={() => { onSelectConv(c.id); navigate("/"); onClose?.(); }}
                onDelete={deleteConv} onMove={moveConv} projects={allProjects}
              />
            ))}
          </div>
        )}
      </div>

      {/* Bottom nav */}
      <div className="border-t border-s-sidebar-border px-2 py-3 space-y-0.5">
        <button onClick={() => goTo("/notas")}
          className={`w-full flex items-center gap-2.5 px-2 py-2 rounded text-[16px] transition-colors ${
            isActive("/notas") ? "bg-s-sidebar-hover text-s-sidebar-text" : "text-s-sidebar-muted hover:bg-s-sidebar-hover hover:text-s-sidebar-text"
          }`}>
          <StickyNote size={15} /> Notas
        </button>
        <button onClick={() => goTo("/agenda")}
          className={`w-full flex items-center gap-2.5 px-2 py-2 rounded text-[16px] transition-colors ${
            isActive("/agenda") ? "bg-s-sidebar-hover text-s-sidebar-text" : "text-s-sidebar-muted hover:bg-s-sidebar-hover hover:text-s-sidebar-text"
          }`}>
          <Calendar size={15} /> Agenda
        </button>

        {profile?.role === "admin" && (
          <button onClick={() => goTo("/admin")}
            className={`w-full flex items-center gap-2.5 px-2 py-2 rounded text-[16px] transition-colors ${
              isActive("/admin") ? "bg-s-sidebar-hover text-s-sidebar-text" : "text-s-sidebar-muted hover:bg-s-sidebar-hover hover:text-s-sidebar-text"
            }`}>
            <ShieldCheck size={15} /> Admin
          </button>
        )}

        {!installed && !isStandalone && (
          <button onClick={handleInstall}
            className="lg:hidden w-full flex items-center gap-2.5 px-2 py-2 rounded text-[16px] text-s-sidebar-muted hover:bg-s-sidebar-hover hover:text-s-sidebar-text transition-colors">
            <Download size={16} /> Instalar app
          </button>
        )}

        {/* User + logout */}
        <div className="flex items-center justify-between px-2 pt-2 mt-1 border-t border-s-sidebar-border">
          <div className="min-w-0">
            <p className="text-[12px] text-s-sidebar-text truncate">{profile?.name ?? profile?.email ?? ""}</p>
            <p className="text-[11px] text-s-sidebar-muted">SKEMA v0.1</p>
          </div>
          <button
            onClick={signOut}
            className="p-1.5 rounded hover:bg-s-sidebar-hover text-s-sidebar-muted hover:text-s-sidebar-text transition-colors flex-shrink-0"
            title="Cerrar sesión"
          >
            <LogOut size={14} />
          </button>
        </div>
      </div>

      {/* FAB — Nuevo chat */}
      <button
        onClick={() => { onNewChat(); onClose?.(); }}
        className="lg:hidden absolute bottom-24 right-4 flex items-center gap-2 px-5 py-3 rounded-full bg-white text-black text-[15px] font-medium shadow-lg hover:opacity-90 transition-opacity"
        title="Nuevo chat"
      >
        <PenLine size={16} />
        Nuevo chat
      </button>
    </div>
  );
}

function ConvItem({ conv, active, onSelect, onDelete, onMove, projects, indent = false }: {
  conv: Conversation; active: boolean;
  onSelect: () => void;
  onDelete: (e: React.MouseEvent, id: string) => void;
  onMove: (convId: string, projectId: string | null) => void;
  projects: Project[];
  indent?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} onClick={onSelect}
      className={`relative flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer group ${indent ? "ml-4" : ""} ${active ? "bg-s-sidebar-hover" : "hover:bg-s-sidebar-hover"}`}>
      <MessageSquare size={12} className="text-s-sidebar-muted flex-shrink-0" />
      <span className="flex-1 text-[15px] truncate text-s-sidebar-text">{conv.title}</span>
      <div className="hidden group-hover:flex items-center gap-0.5">
        {projects.length > 0 && (
          <button
            onClick={e => { e.stopPropagation(); setOpen(v => !v); }}
            className="p-0.5 rounded hover:bg-white/10 text-s-sidebar-muted hover:text-s-sidebar-text"
            title="Mover a proyecto"
          >
            <FolderInput size={11} />
          </button>
        )}
        <button onClick={e => onDelete(e, conv.id)}
          className="p-0.5 rounded hover:bg-white/10 text-s-sidebar-muted hover:text-s-danger">
          <Trash2 size={11} />
        </button>
      </div>
      {open && (
        <div
          onClick={e => e.stopPropagation()}
          className="absolute right-0 top-full mt-1 z-50 bg-s-sidebar border border-s-sidebar-border rounded-lg shadow-lg py-1 min-w-[160px]"
        >
          {conv.projectId && (
            <button
              onClick={() => { onMove(conv.id, null); setOpen(false); }}
              className="w-full text-left px-3 py-1.5 text-[13px] text-s-sidebar-muted hover:bg-s-sidebar-hover hover:text-s-sidebar-text"
            >
              Sin proyecto
            </button>
          )}
          {projects.map(p => (
            <button key={p.id}
              onClick={() => { onMove(conv.id, p.id); setOpen(false); }}
              className={`w-full text-left px-3 py-1.5 text-[13px] hover:bg-s-sidebar-hover ${conv.projectId === p.id ? "text-s-sidebar-text font-medium" : "text-s-sidebar-muted hover:text-s-sidebar-text"}`}
            >
              {p.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}
