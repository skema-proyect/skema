import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM = `Eres un consultor experto en normativa urbanística y de edificación de España, especializado en Gran Canaria y Canarias.

Tu conocimiento abarca:
- Plan General de Ordenación (PGO/PGOU) de los 21 municipios de Gran Canaria
- Normativas urbanísticas municipales
- Ley del Suelo de Canarias (Ley 4/2017, Texto Refundido)
- Código Técnico de la Edificación (CTE)
- Reglamento de Urbanismo de Canarias
- BOC (Boletín Oficial de Canarias)
- Normativas específicas de zonas turísticas y protegidas en Gran Canaria

INSTRUCCIONES:
- Responde de forma técnica y precisa, como lo haría un arquitecto o aparejador experto.
- Cita el artículo, norma o plan específico cuando sea posible.
- Si hay ambigüedad o la norma puede variar, indícalo claramente.
- Si no tienes certeza sobre un dato concreto, recomienda verificar en el texto oficial y dónde encontrarlo.
- Sé directo y útil — el usuario es un Director Administrativo de un estudio de arquitectura con amplia experiencia.`;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { municipio, query } = req.body;
  if (!query) return res.status(400).json({ error: "Sin consulta" });

  const userMessage = municipio
    ? `Municipio: ${municipio}\n\nConsulta: ${query}`
    : query;

  try {
    const message = await client.messages.create({
      model:      "claude-sonnet-4-6",
      max_tokens: 2048,
      system:     SYSTEM,
      messages: [{ role: "user", content: userMessage }],
    });

    const answer = message.content[0]?.text ?? "";
    res.json({ answer, municipio });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
