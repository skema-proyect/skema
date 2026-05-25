import { Download } from "lucide-react";

interface Props {
  svg: string;
  planId: string | null;
  version: number;
}

export default function FloorPlanCard({ svg, planId, version }: Props) {
  const handleDownload = () => {
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `plano-v${version}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!svg?.startsWith("<svg")) return null;

  return (
    <div className="border border-s-border rounded-lg overflow-hidden mt-2">
      <div className="flex items-center justify-between px-3 py-2 border-b border-s-border bg-s-surface">
        <span className="text-[11px] text-s-muted uppercase tracking-wider">
          Plano de planta{version > 1 ? ` · v${version}` : ""}
          {planId && <span className="ml-2 opacity-40 font-mono">{planId.slice(0, 8)}</span>}
        </span>
        <button
          onClick={handleDownload}
          className="flex items-center gap-1.5 text-[11px] text-s-muted hover:text-s-text transition-colors"
        >
          <Download size={12} /> Descargar SVG
        </button>
      </div>
      <div className="bg-white p-2 overflow-x-auto">
        <div
          dangerouslySetInnerHTML={{ __html: svg }}
          style={{ maxWidth: "100%", height: "auto" }}
        />
      </div>
    </div>
  );
}
