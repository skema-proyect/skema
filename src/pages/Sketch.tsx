import { useState } from "react";
import { PenTool, Download, Loader2 } from "lucide-react";

export default function Sketch() {
  const [input,   setInput]   = useState("");
  const [svg,     setSvg]     = useState("");
  const [loading, setLoading] = useState(false);

  const generate = async () => {
    if (!input.trim()) return;
    setLoading(true);
    try {
      const res  = await fetch("/api/sketch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: input }),
      });
      const data = await res.json();
      setSvg(data.svg ?? "");
    } finally {
      setLoading(false);
    }
  };

  const downloadSVG = () => {
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = "plano-skema.svg";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="px-8 py-10 max-w-5xl mx-auto">
      <h1 className="text-skema-text font-inter text-xl font-light mb-1">Planos Esquemáticos</h1>
      <p className="text-skema-muted text-[13px] mb-8">
        Describe las medidas y SKEMA genera un plano de referencia inmediata.
      </p>

      {/* Input */}
      <div className="bg-skema-surface border border-skema-border rounded-xl p-6 mb-5">
        <p className="text-skema-muted text-[11px] tracking-wider uppercase mb-3">Descripción del plano</p>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Ej: Planta rectangular de 12x8 metros. Sala principal 6x8 al norte. Dos habitaciones de 3x4 al sur. Baño 2x2 en esquina sureste. Cocina 3x3 al este."
          rows={4}
          className="w-full bg-skema-bg border border-skema-border rounded-lg px-4 py-3 text-skema-text text-[13px] font-inter outline-none focus:border-skema-accent transition-colors resize-none"
        />
        <button
          onClick={generate}
          disabled={loading || !input.trim()}
          className="mt-4 flex items-center gap-2 bg-skema-accent hover:bg-skema-accent-dark text-white font-inter text-[12px] px-5 py-2.5 rounded-lg transition-colors disabled:opacity-50"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <PenTool size={14} />}
          {loading ? "Generando..." : "Generar plano"}
        </button>
      </div>

      {/* SVG output */}
      {svg && (
        <div className="bg-skema-surface border border-skema-border rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <p className="text-skema-muted text-[11px] tracking-wider uppercase">Plano generado</p>
            <button
              onClick={downloadSVG}
              className="flex items-center gap-2 text-skema-muted hover:text-skema-text text-[12px] font-inter transition-colors"
            >
              <Download size={14} />
              Descargar SVG
            </button>
          </div>
          <div
            className="w-full bg-white rounded-lg overflow-hidden"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        </div>
      )}
    </div>
  );
}
