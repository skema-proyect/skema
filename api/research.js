// Usa Perplexity Sonar para búsqueda web en tiempo real.
// Si no hay PERPLEXITY_API_KEY configurada, responde con aviso claro.

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { query } = req.body;
  if (!query) return res.status(400).json({ error: "Sin consulta" });

  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) {
    return res.json({
      answer:  "El módulo de Investigación requiere una API key de Perplexity. Configúrala en las variables de entorno de Vercel como PERPLEXITY_API_KEY.",
      sources: [],
    });
  }

  try {
    const response = await fetch("https://api.perplexity.ai/chat/completions", {
      method:  "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({
        model:  "sonar",
        messages: [
          {
            role:    "system",
            content: "Eres un investigador especializado en arquitectura, ingeniería y construcción en España. Responde en español, con datos actuales y cita las fuentes.",
          },
          { role: "user", content: query },
        ],
        return_citations: true,
      }),
    });

    const data    = await response.json();
    const message = data.choices?.[0]?.message;
    const answer  = message?.content ?? "Sin respuesta.";
    const sources = (data.citations ?? []).map((url, i) => ({
      title: `Fuente ${i + 1}`,
      url,
    }));

    res.json({ answer, sources });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
