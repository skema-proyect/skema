import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MODELS = {
  fast:  "claude-haiku-4-5-20251001",
  smart: "claude-sonnet-4-6",
};

const SYSTEM = `Eres SKEMA, asistente personal de dirección de un estudio de arquitectura e ingeniería en Gran Canaria.
Tu usuario es un Ingeniero Director Administrativo con amplia experiencia técnica y directiva.

Capacidades:
- Consultor técnico de arquitectura, ingeniería y construcción
- Experto en normativa urbanística de Gran Canaria y España (PGO, CTE, Ley del Suelo de Canarias)
- Redactor de documentos profesionales (informes, actas, notas)
- Asistente general de dirección

Reglas:
- Responde siempre en español
- Tono profesional, directo, de tú a tú. Sin muletillas ("claro que sí", "por supuesto", "¡Genial!")
- Ve al grano. El usuario valora la eficiencia
- Si no sabes algo con certeza, dilo claramente y orienta a dónde verificarlo`;

const NORMATIVA_SYSTEM = `${SYSTEM}

MODO NORMATIVA ACTIVO:
Responde como consultor experto en normativa urbanística de Gran Canaria.
Cita artículos, planes y normas específicas cuando sea posible.
Si hay ambigüedad, indícalo y orienta a la fuente oficial.`;

const DOCUMENT_SYSTEM = `${SYSTEM}

MODO REDACCIÓN ACTIVO:
Genera documentos profesionales estructurados.
Elimina las muletillas del lenguaje hablado.
Usa formato claro con secciones, bullet points donde sea eficiente.`;

const SKETCH_SYSTEM = `Eres un generador de planos esquemáticos SVG para un estudio de arquitectura.
Responde ÚNICAMENTE con el código SVG. Sin explicación, sin markdown.
Viewport 800x600. viewBox="0 0 800 600".
Paredes: stroke #333, strokeWidth 2, fill blanco o #F8F8F8.
Etiquetas: font-family monospace, font-size 11px, color #333.
Incluye cotas exteriores y escala gráfica.
Si hay orientación, añade símbolo N en esquina superior derecha.`;

// ── Intent detection ───────────────────────────────────────────────────────────
function detectIntent(message) {
  if (
    /\b(plano|planta|croquis|esquema)\b/i.test(message) &&
    /\d+\s*[x×]\s*\d+|\d+\s*(m|metro|cm)/i.test(message)
  ) return "sketch";

  if (/\b(normativa|pgou?|ayuntamiento|urbanismo|edificaci|licencia|retranqueo|altura.*máxim|coeficiente|parcela|uso.*suelo|pgm|catálogo)\b/i.test(message))
    return "normativa";

  if (/\b(redacta|escribe un|genera un|elabora un).{0,20}(informe|acta|nota|resumen|documento)/i.test(message))
    return "document";

  return "chat";
}

// ── Model selection ────────────────────────────────────────────────────────────
function selectModel(message, intent) {
  if (intent !== "chat") return MODELS.smart;

  let score = 0;
  if (message.length > 150) score += 2;
  if (message.length > 350) score += 2;
  if (/analiza|explica|desarrolla|compara|evalúa|justifica|razona|diferencia/i.test(message)) score += 2;
  if (/proyecto|técnico|arquitectura|ingeniería|estructura|presupuesto/i.test(message)) score += 1;

  return score >= 3 ? MODELS.smart : MODELS.fast;
}

// ── Handler ────────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { messages = [] } = req.body;
  if (!messages.length) return res.status(400).json({ error: "Sin mensajes" });

  const lastUser = [...messages].reverse().find(m => m.role === "user");
  if (!lastUser) return res.status(400).json({ error: "Sin mensaje de usuario" });

  const intent = detectIntent(lastUser.content);
  const model  = selectModel(lastUser.content, intent);

  // Prepare history (strip internal fields, keep role+content)
  const history = messages.map(m => ({ role: m.role, content: m.content }));

  try {
    // ── Sketch ──
    if (intent === "sketch") {
      const msg = await client.messages.create({
        model: MODELS.smart,
        max_tokens: 4096,
        system: SKETCH_SYSTEM,
        messages: [{ role: "user", content: lastUser.content }],
      });
      let svg = msg.content[0]?.text ?? "";
      svg = svg.replace(/```svg\n?/gi, "").replace(/```\n?/g, "").trim();
      return res.json({ content: "Aquí tienes el plano esquemático:", tool: "sketch", model: MODELS.smart, svg });
    }

    // ── Normativa ──
    if (intent === "normativa") {
      const msg = await client.messages.create({
        model: MODELS.smart,
        max_tokens: 2048,
        system: NORMATIVA_SYSTEM,
        messages: history,
      });
      return res.json({ content: msg.content[0]?.text ?? "", tool: "normativa", model: MODELS.smart });
    }

    // ── Document ──
    if (intent === "document") {
      const msg = await client.messages.create({
        model: MODELS.smart,
        max_tokens: 3000,
        system: DOCUMENT_SYSTEM,
        messages: history,
      });
      return res.json({ content: msg.content[0]?.text ?? "", tool: "document", model: MODELS.smart });
    }

    // ── General chat ──
    const msg = await client.messages.create({
      model,
      max_tokens: 1500,
      system: SYSTEM,
      messages: history,
    });
    return res.json({ content: msg.content[0]?.text ?? "", tool: "chat", model });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
