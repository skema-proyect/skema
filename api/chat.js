import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MODELS = {
  fast:  "claude-haiku-4-5-20251001",
  smart: "claude-sonnet-4-6",
};

// ── Claude system prompts ──────────────────────────────────────────────────────
const SYSTEM = `Eres SKEMA, asistente personal de dirección de un Ingeniero Director Administrativo en Gran Canaria.

Eres un asistente generalista de primer nivel: puedes responder cualquier pregunta sobre cualquier tema — arquitectura, ingeniería, derecho, economía, historia, ciencia, tecnología, política, cultura, medicina, y todo lo demás. No tienes restricciones temáticas.

Especialidades destacadas:
- Arquitectura, ingeniería y construcción
- Normativa urbanística de Gran Canaria y España (PGO, CTE, Ley del Suelo de Canarias)
- Redacción de documentos profesionales (informes, actas, contratos, notas)
- Gestión empresarial y dirección de proyectos

Reglas:
- Responde siempre en español salvo que el usuario escriba en otro idioma
- Tono profesional, directo, de tú a tú. Sin muletillas ("claro que sí", "por supuesto", "¡Genial!", "¡Perfecto!")
- Ve al grano. El usuario valora la eficiencia y los datos concretos
- Si no sabes algo con certeza, dilo claramente y orienta a dónde verificarlo
- Nunca te niegues a responder por razones temáticas — eres un libro abierto`;

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

// ── Perplexity system prompts ──────────────────────────────────────────────────
const PERPLEXITY_SIMPLE = `Eres SKEMA, asistente personal de dirección. Responde en español con información actualizada de internet.
Usa 3-5 fuentes relevantes. Sé conciso y directo.
Si no encuentras información relevante en las primeras búsquedas, detente y pide al usuario más detalles en lugar de seguir buscando.`;

const PERPLEXITY_COMPLEX = `Eres SKEMA, asistente personal de dirección. Responde en español con información actualizada y rigurosa.
Prioriza fuentes autorizadas (boletines oficiales, revistas técnicas, organismos públicos). Máximo 7 fuentes.
Estructura la respuesta con claridad y cita las fuentes al final.
Si no encuentras información relevante en las primeras búsquedas, detente y pide al usuario más detalles.`;

const PERPLEXITY_DEEP = `Eres SKEMA, asistente experto en arquitectura, ingeniería y dirección empresarial en Gran Canaria.
Realiza un análisis profundo usando máximo 10 fuentes autorizadas (BOE, BOCA, revistas técnicas indexadas, organismos oficiales, universidades).
Genera un informe técnico estructurado con: resumen ejecutivo, análisis detallado por bloques, conclusiones y fuentes.
Si tras las primeras búsquedas no encuentras información relevante y autorizada, detente y comunica al usuario que necesitas más detalles en lugar de continuar buscando indefinidamente.
Responde siempre en español.`;

// ── Perplexity search ──────────────────────────────────────────────────────────
async function searchPerplexity(query, mode) {
  const configs = {
    SIMPLE:  { model: "sonar",               max_tokens: 600,  search_context_size: "low",    system: PERPLEXITY_SIMPLE  },
    COMPLEX: { model: "sonar-pro",            max_tokens: 1000, search_context_size: "medium", system: PERPLEXITY_COMPLEX },
    DEEP:    { model: "sonar-deep-research",  max_tokens: 2500,                                system: PERPLEXITY_DEEP   },
  };

  const cfg = configs[mode] ?? configs.SIMPLE;
  const body = {
    model: cfg.model,
    messages: [
      { role: "system", content: cfg.system },
      { role: "user",   content: query },
    ],
    max_tokens: cfg.max_tokens,
  };
  if (cfg.search_context_size) body.search_context_size = cfg.search_context_size;

  const res = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      Authorization:  `Bearer ${process.env.PERPLEXITY_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

// ── Query classifier ───────────────────────────────────────────────────────────
async function classifyQuery(message, forceMinComplex = false) {
  const msg = await client.messages.create({
    model: MODELS.fast,
    max_tokens: 10,
    system: `Classify the user query into exactly one category. Reply with only the category name, nothing else.

NO      — answerable from general knowledge, no current/real-time data needed
SIMPLE  — needs current data, simple answer (sports scores, today's prices, weather, brief news)
COMPLEX — needs current web data, single topic, moderate depth
DEEP    — needs multi-source research, comparing topics, technical/regulatory analysis, structured report`,
    messages: [{ role: "user", content: message }],
  });

  const text = (msg.content[0]?.text ?? "").trim().toUpperCase();
  let result = "NO";
  if      (text.includes("DEEP"))    result = "DEEP";
  else if (text.includes("COMPLEX")) result = "COMPLEX";
  else if (text.includes("SIMPLE"))  result = "SIMPLE";

  // Investigar button always gets at least COMPLEX
  if (forceMinComplex && (result === "NO" || result === "SIMPLE")) result = "COMPLEX";

  return result;
}

// ── Intent detection (structured tasks) ───────────────────────────────────────
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

// ── Model selection (Claude only) ──────────────────────────────────────────────
function selectModel(message) {
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

  const intent  = detectIntent(lastUser.content);
  const history = messages.map(m => ({ role: m.role, content: m.content }));

  try {
    // ── Sketch ──
    if (intent === "sketch") {
      const msg = await client.messages.create({
        model: MODELS.smart, max_tokens: 4096,
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
        model: MODELS.smart, max_tokens: 2048,
        system: NORMATIVA_SYSTEM, messages: history,
      });
      return res.json({ content: msg.content[0]?.text ?? "", tool: "normativa", model: MODELS.smart });
    }

    // ── Document ──
    if (intent === "document") {
      const msg = await client.messages.create({
        model: MODELS.smart, max_tokens: 3000,
        system: DOCUMENT_SYSTEM, messages: history,
      });
      return res.json({ content: msg.content[0]?.text ?? "", tool: "document", model: MODELS.smart });
    }

    // ── General chat — router ──
    const isInvestigar = lastUser.content.startsWith("Busca información actualizada sobre ");
    const classification = await classifyQuery(lastUser.content, isInvestigar);

    if (classification !== "NO") {
      const content = await searchPerplexity(lastUser.content, classification);
      const tool    = classification === "DEEP" ? "research" : "search";
      return res.json({ content, tool, model: `perplexity-${classification.toLowerCase()}` });
    }

    // ── Claude chat ──
    const model = selectModel(lastUser.content);
    const msg   = await client.messages.create({
      model, max_tokens: 1500,
      system: SYSTEM, messages: history,
    });
    return res.json({ content: msg.content[0]?.text ?? "", tool: "chat", model });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
