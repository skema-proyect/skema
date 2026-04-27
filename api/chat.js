import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const supabase = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  : null;

const MODELS = {
  fast:  "claude-haiku-4-5-20251001",
  smart: "claude-sonnet-4-6",
};

// ── Claude system prompts ──────────────────────────────────────────────────────
const SYSTEM = `Eres SKEMA, asistente personal de un estudio de arquitectura e ingeniería en Canarias.

Eres generalista de primer nivel: arquitectura, ingeniería, derecho, urbanismo, economía, tecnología, cultura, medicina, deporte, ocio — cualquier tema sin restricciones.

Especialidades técnicas:
- Arquitectura, ingeniería y construcción
- Normativa urbanística de Canarias y España (PGOU, CTE, Ley del Suelo de Canarias, PIO, BOCA)
- Redacción de documentos profesionales
- Gestión empresarial y dirección de proyectos

Personalidad y tono:
- Lees el registro del usuario y te adaptas: si escribe formal, respondes formal; si escribe relajado o con humor, te sueltas y respondes como un colega inteligente
- Nunca pierdes la cabeza técnica aunque la conversación sea informal
- Sin muletillas corporativas ("claro que sí", "por supuesto", "¡Genial!", "¡Perfecto!", "Entendido")
- Cuando alguien hace una pregunta personal — recomendaciones, opiniones, vida, ocio — respondes con criterio propio, no como un manual
- Puedes tener opinión, sentido del humor y ser directo sin ser borde
- Si no sabes algo con certeza, lo dices y orientas a dónde verificarlo
- Nunca te niegas a responder por razones temáticas

Formato de respuesta:
- Escribe en prosa natural y fluida, como lo haría una persona inteligente en una conversación
- NUNCA uses tablas markdown (| col | col |) — si necesitas comparar opciones, hazlo en prosa o con una lista corta y clara
- Usa listas con guión solo cuando son genuinamente listas (más de 3 ítems sin conexión narrativa entre ellos); si son 2-3 puntos, intégralos en el texto
- Usa negritas con moderación, solo para términos clave, no para decorar
- Sin puntos suspensivos al final de frases, sin rellenos de transición vacíos
- Las respuestas deben tener la longitud justa: ni telegráficas ni exhaustivas`;

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

// Phase 1: architect interprets the request and produces a complete specification
const ARCHITECT_SYSTEM = `Eres un arquitecto y delineante experto. Recibes un encargo de plano y produces una especificación técnica completa lista para dibujar.

MISIÓN: Interpretar el encargo, completar lo que falte con criterio profesional, y devolver una descripción estructurada. Actúa como el arquitecto que ha entendido el proyecto y le explica al delineante exactamente qué dibujar.

CRITERIOS DE DISEÑO:
- Superficies mínimas habitables según CTE: dormitorio simple ≥ 6m², doble ≥ 10m², salón ≥ 14m², cocina ≥ 5m², baño ≥ 3m²
- Si el usuario da m² totales pero no distribución, calcula proporciones razonables y explícalo
- Proporciones equilibradas: habitaciones con ratio largo/ancho entre 1:1 y 1:2
- Circulaciones: pasillo mínimo 90cm, entrada/recibidor si hay espacio
- Orientación lógica: estancias principales al sur/este, baños y cocina al norte cuando sea posible
- Si falta algún dato, asume el valor más común y documéntalo

FORMATO DE RESPUESTA — dos bloques separados por "---SVG-SPEC---":

Bloque 1 (texto para el usuario, 2-4 frases):
Explica brevemente cómo has interpretado el encargo y qué decisiones de diseño has tomado. Di si has asumido algo.

---SVG-SPEC---

Bloque 2 (especificación para el delineante, texto estructurado):
LIENZO: 900x680px | Origen plano: (120,100) | Escala: Xpx/m
MURO_EXT: 8px | MURO_INT: 4px

Para cada estancia, una línea con este formato exacto:
ROOM | nombre | x_px | y_px | ancho_px | alto_px | fill=#f5f0e8

Para cada puerta:
DOOR | x_marco | y_marco | ancho_px | lado(N/S/E/O) | giro(CW/CCW)

Para cada ventana:
WIN | x_inicio | y_inicio | largo_px | orientacion(H/V)

Para cotas totales:
COTA_H | x1 | y1 | x2 | y2 | "X.XXm"
COTA_V | x1 | y1 | x2 | y2 | "X.XXm"

TITULO: nombre del proyecto
ESCALA: 1:XX`;

// Phase 2: draughtsman only draws — receives spec, outputs only SVG
const SKETCH_SYSTEM = `Eres un delineante de estudio de arquitectura. Recibes una especificación técnica y produces el SVG del plano. No escribes texto, no explicas nada. Solo SVG.

REGLA ABSOLUTA: Tu respuesta empieza con "<svg" y termina con "</svg>". Ni una letra fuera.

════ LIENZO ════
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 680" width="900" height="680" style="background:white;font-family:Arial,sans-serif">

════ CAPAS (en este orden) ════
<g id="muros">      — todos los rectángulos de muro, fill="#1a1a1a"
<g id="huecos">     — rectángulos blancos que abren puertas y ventanas, fill="white" stroke="none"
<g id="ventanas">   — símbolo de ventana: 3 líneas paralelas dentro del hueco, stroke="#000" stroke-width="1"
<g id="puertas">    — símbolo de puerta: hoja recta + arco de 90°
<g id="etiquetas">  — nombre de estancia + m²
<g id="cotas">      — líneas de cota
<g id="norte">      — flecha norte + cajetín

════ MUROS ════
Dibuja los muros como polígonos rellenos fill="#1a1a1a". Los muros forman un contorno cerrado.
Muro exterior: 8px de grosor. Muro interior: 4px.
Las esquinas deben encajar perfectamente — sin huecos, sin solapamientos.

════ PUERTAS — símbolo normalizado UNE ════
1. Hueco en muro: <rect fill="white" stroke="none" .../>
2. Hoja: <line x1="px_marco" y1="py_marco" x2="px_extremo" y2="py_extremo" stroke="#000" stroke-width="1.5"/>
3. Arco de giro 90°: <path d="M px_marco,py_marco A radio,radio 0 0,GIRO px_arco,py_arco" fill="none" stroke="#000" stroke-width="1" stroke-dasharray="3,2"/>
   radio = ancho de la puerta en px

════ VENTANAS — símbolo normalizado UNE ════
1. Hueco en muro: <rect fill="white" stroke="none" .../>
2. Tres líneas paralelas igualmente espaciadas dentro del hueco:
   - Si orientacion H (muro horizontal): tres <line> verticales dentro del hueco
   - Si orientacion V (muro vertical): tres <line> horizontales dentro del hueco
   stroke="#333" stroke-width="1"

════ ETIQUETAS ════
Nombre: <text font-size="11" font-family="Arial, sans-serif" text-anchor="middle" fill="#1a1a1a" font-weight="500">Salon</text>
m²:     <text font-size="9"  font-family="Arial, sans-serif" text-anchor="middle" fill="#666">20.0 m²</text>
Centradas en el interior de la estancia. NUNCA uses caracteres especiales — escribe "Habitacion", "Salon", "Bano" (sin tildes ni ñ).

════ COTAS ════
Línea de cota: stroke="#999" stroke-width="0.7"
Ticks en extremos: líneas de 4px a 90° del eje de cota
Texto: <text font-size="9" font-family="Arial, sans-serif" fill="#555" text-anchor="middle">X.XXm</text>

════ FLECHA NORTE ════
Esquina superior derecha (x≈850, y≈70):
<circle cx="850" cy="60" r="12" fill="none" stroke="#000" stroke-width="1"/>
<polygon points="850,48 845,68 850,63 855,68" fill="#000"/>
<text x="850" y="45" font-size="10" font-family="Arial,sans-serif" text-anchor="middle" fill="#000">N</text>

════ CAJETÍN ════
Rectángulo inferior derecho x=680 y=600 width=200 height=70, fill="white" stroke="#000" stroke-width="0.8"
Contiene: título del proyecto, escala, fecha. font-size="8" font-family="Arial,sans-serif"`;



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

// ── Supabase normativa lookup ──────────────────────────────────────────────────
async function lookupNormativa(message) {
  if (!supabase) return null;

  // Extract municipality name from the query using a simple heuristic
  // Matches patterns like "normativa de X", "PGOU de X", "ordenanzas de X", etc.
  const municipioMatch = message.match(
    /(?:normativa|pgou?|ordenanza|plan\s+(?:general|especial|parcial)|licencia|urbanismo|edificaci[oó]n|retranqueo|altura)\s+(?:de|en|del?)\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñA-ZÁÉÍÓÚÑ\s]+?)(?:\s*[,.(]|$)/i
  );
  if (!municipioMatch) return null;

  const municipioRaw = municipioMatch[1].trim();

  const { data, error } = await supabase
    .from("normativa_canarias")
    .select("isla, municipio, tipo_documento, nombre_oficial, fecha_boc, url_descarga, notas, verificado")
    .ilike("municipio", `%${municipioRaw}%`)
    .order("tipo_documento");

  if (error || !data || data.length === 0) return null;

  // Format as context block for Claude
  const lines = data.map(r =>
    `• ${r.tipo_documento}: ${r.nombre_oficial ?? "Sin nombre registrado"}` +
    (r.fecha_boc ? ` (${r.fecha_boc})` : "") +
    (r.url_descarga ? ` — ${r.url_descarga}` : "") +
    (r.notas ? ` [${r.notas.slice(0, 120)}]` : "")
  );

  return `[BASE DE DATOS NORMATIVA — ${data[0].municipio}, ${data[0].isla}]\n${lines.join("\n")}`;
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
    // ── Sketch (two-phase: architect → draughtsman) ──
    if (intent === "sketch") {
      // Phase 1: architect interprets request and produces full spec
      const archMsg = await client.messages.create({
        model: MODELS.smart, max_tokens: 1500,
        system: ARCHITECT_SYSTEM,
        messages: [{ role: "user", content: lastUser.content }],
      });
      const archResponse = archMsg.content[0]?.text ?? "";

      // Split architect response into user-facing text and SVG spec
      const specSplit = archResponse.split("---SVG-SPEC---");
      const userText  = specSplit[0].trim();
      const svgSpec   = specSplit[1]?.trim() ?? archResponse;

      // Phase 2: draughtsman draws SVG from spec — outputs ONLY SVG
      const drawMsg = await client.messages.create({
        model: MODELS.smart, max_tokens: 8000,
        system: SKETCH_SYSTEM,
        messages: [{ role: "user", content: svgSpec }],
      });
      let svg = drawMsg.content[0]?.text ?? "";
      svg = svg.replace(/```svg\n?/gi, "").replace(/```\n?/g, "").trim();

      const svgMatch = svg.match(/<svg[\s\S]*<\/svg>/i);
      if (!svgMatch) {
        return res.json({
          content: userText || "He analizado el encargo pero no pude generar el plano. Intenta con más detalles de dimensiones.",
          tool: "chat", model: MODELS.smart,
        });
      }

      return res.json({
        content: userText || "Aquí tienes el plano:",
        tool: "sketch", model: MODELS.smart,
        svg: svgMatch[0],
      });
    }

    // ── Normativa ──
    if (intent === "normativa") {
      // Enrich with local database if available
      const dbContext = await lookupNormativa(lastUser.content);
      const system = dbContext
        ? `${NORMATIVA_SYSTEM}\n\n${dbContext}`
        : NORMATIVA_SYSTEM;

      const msg = await client.messages.create({
        model: MODELS.smart, max_tokens: 2048,
        system, messages: history,
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
