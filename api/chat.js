import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MODELS = {
  fast:  "claude-haiku-4-5-20251001",
  smart: "claude-sonnet-4-6",
};

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

const SEARCH_SYSTEM = `${SYSTEM}

MODO BÚSQUEDA ACTIVO:
Se te proporcionan resultados de búsqueda web en tiempo real.
Usa esa información como base principal de tu respuesta.
Cita las fuentes con el formato [Fuente: nombre del sitio] al final de los párrafos relevantes.
Si los resultados no responden bien la pregunta, indícalo y complementa con tu conocimiento.`;

const SKETCH_SYSTEM = `Eres un generador de planos esquemáticos SVG para un estudio de arquitectura.
Responde ÚNICAMENTE con el código SVG. Sin explicación, sin markdown.
Viewport 800x600. viewBox="0 0 800 600".
Paredes: stroke #333, strokeWidth 2, fill blanco o #F8F8F8.
Etiquetas: font-family monospace, font-size 11px, color #333.
Incluye cotas exteriores y escala gráfica.
Si hay orientación, añade símbolo N en esquina superior derecha.`;

// ── Web search via Tavily ──────────────────────────────────────────────────────
async function searchWeb(query) {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: process.env.TAVILY_API_KEY,
      query,
      search_depth: "basic",
      max_results: 5,
      include_answer: true,
    }),
  });
  return res.json();
}

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

// ── Router inteligente: ¿necesita datos en tiempo real? ───────────────────────
async function needsRealTimeData(message) {
  const msg = await client.messages.create({
    model: MODELS.fast,
    max_tokens: 5,
    system: "Answer only YES or NO (in English). Does this question require real-time information, recent news, current prices, sports results, events from 2024-2026, or any data that changes over time?",
    messages: [{ role: "user", content: message }],
  });
  const text = (msg.content[0]?.text ?? "").trim().toUpperCase();
  // Accept YES, Y, SÍ, SI, S — reject NO, N
  return !text.startsWith("N");
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

    // ── General chat — router inteligente ──
    const needsSearch = await needsRealTimeData(lastUser.content);

    if (needsSearch) {
      const searchData = await searchWeb(lastUser.content);
      const snippets = (searchData.results ?? [])
        .slice(0, 5)
        .map((r, i) => `[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.content}`)
        .join("\n\n");
      const augmented = `Pregunta del usuario: ${lastUser.content}\n\nResultados de búsqueda web en tiempo real:\n${snippets}`;
      const msg = await client.messages.create({
        model: MODELS.smart,
        max_tokens: 2048,
        system: SEARCH_SYSTEM,
        messages: [{ role: "user", content: augmented }],
      });
      return res.json({ content: msg.content[0]?.text ?? "", tool: "search", model: MODELS.smart });
    }

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
