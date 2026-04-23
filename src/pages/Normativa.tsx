import { useState } from "react";
import { BookOpen, Search, Loader2 } from "lucide-react";

const MUNICIPIOS = [
  "Las Palmas de Gran Canaria", "Telde", "Santa Lucía de Tirajana",
  "San Bartolomé de Tirajana", "Arucas", "Gáldar", "Agüimes", "Ingenio",
  "Mogán", "La Aldea de San Nicolás", "Firgas", "Agaete", "Valsequillo",
  "Teror", "Vega de San Mateo", "Tejeda", "Valleseco", "Moya",
  "Santa María de Guía", "Pájaros", "Mogan",
];

export default function Normativa() {
  const [municipio, setMunicipio] = useState("Las Palmas de Gran Canaria");
  const [query,     setQuery]     = useState("");
  const [answer,    setAnswer]    = useState("");
  const [loading,   setLoading]   = useState(false);

  const consultar = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setAnswer("");
    try {
      const res  = await fetch("/api/normativa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ municipio, query }),
      });
      const data = await res.json();
      setAnswer(data.answer ?? "Sin respuesta.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="px-8 py-10 max-w-4xl mx-auto">
      <h1 className="text-skema-text font-inter text-xl font-light mb-1">Normativa Urbanística</h1>
      <p className="text-skema-muted text-[13px] mb-8">
        Consulta normativa de los 21 municipios de Gran Canaria.
      </p>

      <div className="bg-skema-surface border border-skema-border rounded-xl p-6 mb-5 space-y-4">

        {/* Municipio */}
        <div>
          <label className="block text-skema-muted text-[11px] tracking-wider uppercase mb-2">
            Municipio
          </label>
          <select
            value={municipio}
            onChange={e => setMunicipio(e.target.value)}
            className="w-full bg-skema-bg border border-skema-border rounded-lg px-4 py-3 text-skema-text text-[13px] font-inter outline-none focus:border-skema-accent transition-colors"
          >
            {MUNICIPIOS.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>

        {/* Consulta */}
        <div>
          <label className="block text-skema-muted text-[11px] tracking-wider uppercase mb-2">
            Consulta
          </label>
          <textarea
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Ej: ¿Cuál es la altura máxima permitida en suelo urbano residencial? ¿Qué retranqueos aplican para parcelas de menos de 500m²?"
            rows={3}
            className="w-full bg-skema-bg border border-skema-border rounded-lg px-4 py-3 text-skema-text text-[13px] font-inter outline-none focus:border-skema-accent transition-colors resize-none"
          />
        </div>

        <button
          onClick={consultar}
          disabled={loading || !query.trim()}
          className="flex items-center gap-2 bg-skema-accent hover:bg-skema-accent-dark text-white font-inter text-[12px] px-5 py-2.5 rounded-lg transition-colors disabled:opacity-50"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
          {loading ? "Consultando..." : "Consultar normativa"}
        </button>
      </div>

      {/* Respuesta */}
      {answer && (
        <div className="bg-skema-surface border border-skema-border rounded-xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <BookOpen size={15} className="text-skema-accent" />
            <p className="text-skema-muted text-[11px] tracking-wider uppercase">
              Respuesta · {municipio}
            </p>
          </div>
          <p className="text-skema-text text-[13px] leading-relaxed whitespace-pre-wrap">{answer}</p>
        </div>
      )}
    </div>
  );
}
