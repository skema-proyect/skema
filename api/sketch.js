import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM = `Eres un generador de planos esquemáticos SVG para un estudio de arquitectura e ingeniería.
El usuario describe un espacio con medidas y tú generas un SVG limpio, técnico y a escala relativa.

REGLAS:
- Responde ÚNICAMENTE con el código SVG, sin explicación, sin markdown, sin bloques de código.
- Viewport: 800x600. Usa viewBox="0 0 800 600".
- Escala proporcionalmente al espacio total descrito.
- Cada estancia debe estar delimitada con rectángulos (stroke #333, fill blanco o gris muy claro).
- Etiqueta cada estancia con su nombre y dimensiones (font-family: monospace, font-size: 11px).
- Incluye una línea de escala gráfica en la esquina inferior derecha.
- Añade cotas (líneas de dimensión) en los lados exteriores principales.
- Usa colores sobrios: paredes #333333, texto #222222, cotas #666666, relleno estancias #F8F8F8.
- Si hay orientación (norte), añade un símbolo N en la esquina superior derecha.
- El resultado debe servir como referencia técnica inmediata para un ingeniero.`;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { description } = req.body;
  if (!description) return res.status(400).json({ error: "Sin descripción" });

  try {
    const message = await client.messages.create({
      model:      "claude-sonnet-4-6",
      max_tokens: 4096,
      system:     SYSTEM,
      messages: [
        {
          role:    "user",
          content: description,
        },
      ],
    });

    let svg = message.content[0]?.text ?? "";

    // Limpiar si Claude envuelve en markdown
    svg = svg.replace(/```svg\n?/gi, "").replace(/```\n?/g, "").trim();

    if (!svg.startsWith("<svg")) {
      return res.status(500).json({ error: "No se generó SVG válido" });
    }

    res.json({ svg });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
