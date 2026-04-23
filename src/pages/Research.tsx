import { useState } from "react";
import { Search, Loader2, ExternalLink } from "lucide-react";

interface Source {
  title: string;
  url: string;
}

export default function Research() {
  const [query,   setQuery]   = useState("");
  const [answer,  setAnswer]  = useState("");
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(false);

  const investigate = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setAnswer("");
    setSources([]);
    try {
      const res  = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const data = await res.json();
      setAnswer(data.answer   ?? "");
      setSources(data.sources ?? []);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="px-8 py-10 max-w-4xl mx-auto">
      <h1 className="text-skema-text font-inter text-xl font-light mb-1">Investigación</h1>
      <p className="text-skema-muted text-[13px] mb-8">
        Búsqueda web en tiempo real: materiales, precios, tendencias, proveedores.
      </p>

      <div className="bg-skema-surface border border-skema-border rounded-xl p-6 mb-5 space-y-4">
        <textarea
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), investigate())}
          placeholder="Ej: Precios actuales de panel sándwich en Canarias. Nuevas normativas CTE 2024. Proveedores de carpintería de aluminio en Gran Canaria."
          rows={3}
          className="w-full bg-skema-bg border border-skema-border rounded-lg px-4 py-3 text-skema-text text-[13px] font-inter outline-none focus:border-skema-accent transition-colors resize-none"
        />
        <button
          onClick={investigate}
          disabled={loading || !query.trim()}
          className="flex items-center gap-2 bg-skema-accent hover:bg-skema-accent-dark text-white font-inter text-[12px] px-5 py-2.5 rounded-lg transition-colors disabled:opacity-50"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
          {loading ? "Investigando..." : "Investigar"}
        </button>
      </div>

      {answer && (
        <div className="bg-skema-surface border border-skema-border rounded-xl p-6">
          <p className="text-skema-muted text-[11px] tracking-wider uppercase mb-4">Resultado</p>
          <p className="text-skema-text text-[13px] leading-relaxed whitespace-pre-wrap mb-6">{answer}</p>

          {sources.length > 0 && (
            <>
              <div className="border-t border-skema-border pt-4">
                <p className="text-skema-muted text-[11px] tracking-wider uppercase mb-3">Fuentes</p>
                <div className="space-y-2">
                  {sources.map((s, i) => (
                    <a
                      key={i}
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-skema-accent hover:text-skema-text text-[12px] font-inter transition-colors"
                    >
                      <ExternalLink size={12} />
                      {s.title}
                    </a>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
