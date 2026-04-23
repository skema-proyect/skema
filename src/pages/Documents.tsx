import { FolderOpen, FileText, Plus } from "lucide-react";

export default function Documents() {
  return (
    <div className="px-8 py-10 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-skema-text font-inter text-xl font-light mb-1">Documentos</h1>
          <p className="text-skema-muted text-[13px]">Archivos organizados por proyecto</p>
        </div>
        <button className="flex items-center gap-2 bg-skema-accent hover:bg-skema-accent-dark text-white font-inter text-[12px] px-4 py-2.5 rounded-lg transition-colors">
          <Plus size={15} />
          Nuevo proyecto
        </button>
      </div>

      <div className="bg-skema-surface border border-skema-border rounded-xl p-10 flex flex-col items-center gap-4 text-center">
        <FolderOpen size={40} className="text-skema-muted" />
        <p className="text-skema-text text-[14px] font-medium">Sin proyectos aún</p>
        <p className="text-skema-muted text-[13px] max-w-sm">
          Cuando generes documentos desde el Estudio de Voz, aparecerán aquí organizados por proyecto.
        </p>
        <div className="flex items-center gap-2 mt-2 text-skema-muted">
          <FileText size={13} />
          <span className="text-[12px]">Los documentos se guardan automáticamente en Supabase</span>
        </div>
      </div>
    </div>
  );
}
