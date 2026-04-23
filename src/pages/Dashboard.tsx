import { Mic, FileText, PenTool, BookOpen, Search, Clock } from "lucide-react";
import { useNavigate } from "react-router-dom";

const modules = [
  {
    icon: Mic,
    label: "Estudio de Voz",
    description: "Graba, transcribe y convierte en documentos profesionales",
    to: "/voz",
    color: "text-blue-400",
    bg: "bg-blue-400/10",
  },
  {
    icon: FileText,
    label: "Documentos",
    description: "Informes, actas y archivos organizados por proyecto",
    to: "/documentos",
    color: "text-emerald-400",
    bg: "bg-emerald-400/10",
  },
  {
    icon: PenTool,
    label: "Planos",
    description: "Genera planos esquemáticos por voz o medidas",
    to: "/planos",
    color: "text-amber-400",
    bg: "bg-amber-400/10",
  },
  {
    icon: BookOpen,
    label: "Normativa",
    description: "Consulta normativa urbanística de Gran Canaria",
    to: "/normativa",
    color: "text-purple-400",
    bg: "bg-purple-400/10",
  },
  {
    icon: Search,
    label: "Investigación",
    description: "Búsqueda de materiales, tendencias y proveedores",
    to: "/investigacion",
    color: "text-rose-400",
    bg: "bg-rose-400/10",
  },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const hour = new Date().getHours();
  const greeting = hour < 13 ? "Buenos días" : hour < 20 ? "Buenas tardes" : "Buenas noches";

  return (
    <div className="px-8 py-10 max-w-5xl mx-auto">

      {/* Header */}
      <div className="mb-10">
        <h1 className="text-skema-text font-inter text-2xl font-light">
          {greeting} <span className="text-skema-accent font-medium">·</span> SKEMA listo
        </h1>
        <p className="text-skema-muted text-[13px] mt-1">
          ¿Qué necesitas hoy?
        </p>
      </div>

      {/* Módulos */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-12">
        {modules.map(({ icon: Icon, label, description, to, color, bg }) => (
          <button
            key={to}
            onClick={() => navigate(to)}
            className="text-left bg-skema-surface border border-skema-border rounded-xl p-5 hover:border-skema-accent/40 transition-all duration-200 group"
          >
            <div className={`w-10 h-10 rounded-lg ${bg} flex items-center justify-center mb-4`}>
              <Icon size={20} className={color} />
            </div>
            <p className="text-skema-text font-inter font-medium text-[14px] mb-1">{label}</p>
            <p className="text-skema-muted text-[12px] leading-relaxed">{description}</p>
          </button>
        ))}
      </div>

      {/* Actividad reciente placeholder */}
      <div className="bg-skema-surface border border-skema-border rounded-xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <Clock size={15} className="text-skema-muted" />
          <p className="text-skema-muted text-[11px] tracking-wider uppercase">Actividad reciente</p>
        </div>
        <p className="text-skema-muted text-[13px]">Sin actividad aún. Empieza grabando una nota de voz.</p>
      </div>
    </div>
  );
}
