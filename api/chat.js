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
- Nunca te niegas a responder por razones temáticas`;

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

const SKETCH_SYSTEM = `Eres un generador de planos arquitectónicos SVG con precisión de CAD profesional (normas UNE/ISO).
Actúas como un delineante de estudio de arquitectura que trabaja en AutoCAD: precisión absoluta, escala real, elementos normalizados.
Responde ÚNICAMENTE con el código SVG completo. Sin explicación, sin markdown, sin bloques de código.

════ LIENZO ════
viewBox="0 0 950 720"
Área útil de dibujo: x=80..870, y=60..580 (reserva márgenes para cotas y cajetín).

════ PROCESO OBLIGATORIO (ejecuta mentalmente antes de generar SVG) ════
1. Lee las dimensiones reales en metros de cada espacio.
2. Calcula: escala_px = min(750 / ancho_total_m, 480 / alto_total_m). Redondea a entero.
3. Asigna origen del plano en (120, 100) — espacio para cotas izquierda y superior.
4. Calcula coordenadas SVG exactas de cada vértice de muro (origen + metros × escala_px).
5. Ubica puertas y ventanas como huecos en los muros con coordenadas precisas.
6. Calcula posición de líneas de cota y textos.
7. Genera el SVG con los grupos en orden correcto.

════ MUROS ════
Muro exterior (30 cm): grosor_px = 0.30 × escala_px. Dibuja como rectángulo relleno fill="#1a1a1a".
Muro interior / tabique (15 cm): grosor_px = 0.15 × escala_px. Dibuja como rectángulo fill="#555555".
Los muros son SIEMPRE rectángulos cerrados (<rect> o <polygon>), nunca <line> sueltas.
Las intersecciones entre muros deben encajar sin huecos ni solapamientos visibles.
Estructura SVG por capas (<g> con id):

<g id="layer-muros"> — muros rellenos primero
<g id="layer-aberturas"> — huecos de puertas y ventanas (rect fill="white" sobre el muro para abrir el hueco)
<g id="layer-simbolos-abertura"> — símbolos de puerta y ventana
<g id="layer-cotas"> — líneas de cota, flechas y textos de medida
<g id="layer-etiquetas"> — nombres de estancias y áreas
<g id="layer-norte-escala"> — flecha norte, escala gráfica, cajetín

════ PUERTAS ════
Norma UNE: hueco en muro + hoja recta + arco de giro de 90°.
Anchuras normalizadas: paso principal 90 cm, habitaciones 80 cm, baños 70 cm.
1. Abre el hueco: <rect fill="white" stroke="none"> sobre el muro en la posición exacta.
2. Hoja de puerta: <line> desde el marco hasta el extremo del giro. stroke="#000" strokeWidth="1.2"
3. Arco de giro: <path d="M fx,fy A r,r 0 0,1 ex,ey" fill="none" stroke="#000" strokeWidth="1" stroke-dasharray="none"/>
   donde r = ancho_puerta_px, (fx,fy) = punto de giro en el marco, (ex,ey) = extremo del arco.

════ VENTANAS ════
Norma UNE: hueco en muro + triple línea (marco exterior, vidrio, marco interior).
Anchuras típicas: salón 120 cm, dormitorios 100 cm, baños 60 cm.
1. Abre el hueco: <rect fill="white" stroke="none">.
2. Tres líneas paralelas dentro del hueco (separadas uniformemente), stroke="#000" strokeWidth="1".

════ COTAS ════
Líneas de cota: stroke="#666" strokeWidth="0.8" — NUNCA usar la misma línea para plano y cota.
Separación del muro exterior: 20 px primer nivel, 36 px segundo nivel.
Marcas de extremo: pequeña línea a 45° de 5px en cada extremo de la cota.
Texto de cota: font-size="10" font-family="monospace" fill="#333" text-anchor="middle".
Formato: "X.XX" (metros con dos decimales) centrado sobre la línea.
Cotas OBLIGATORIAS:
  - Cota total horizontal (longitud total del plano).
  - Cota total vertical (anchura total del plano).
  - Cotas parciales de cada vano (puerta/ventana) y entre vanos.

════ ETIQUETAS DE ESTANCIAS ════
Nombre en MAYÚSCULAS: font-size="11" font-family="monospace" text-anchor="middle" fill="#111".
Área m² debajo: font-size="9" font-family="monospace" text-anchor="middle" fill="#666".
Ambas centradas geométricamente en la estancia.

════ ESCALA GRÁFICA ════
Posición: parte inferior del plano, bajo el dibujo, alineada a la izquierda.
Representa 5 segmentos de 1 m cada uno (o 2 m si la escala es pequeña).
Segmentos alternos fill="#000" y fill="#fff" stroke="#000" strokeWidth="0.8", altura 6px.
Texto: "0" al inicio, "1m", "2m"... al final de cada segmento. font-size="8" font-family="monospace".
Debajo del bar: "Esc. 1:XX" donde XX = round(1/escala_px × 1000).

════ FLECHA NORTE ════
Posición: esquina superior derecha del lienzo (x≈870, y≈80).
Símbolo: círculo de r=14 stroke="#000" fill="none" + flecha interior apuntando arriba fill="#000" + letra "N" encima.

════ CAJETÍN ════
Rectángulo inferior derecho: ancho 200px, alto 80px, esquina en (750, 630).
Líneas internas separando: PROYECTO / CONTENIDO / ESC. / FECHA.
Rellena con los datos inferidos del encargo. font-size="9" font-family="monospace".
stroke="#000" strokeWidth="0.8" fill="white".`;


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
    // ── Sketch ──
    if (intent === "sketch") {
      const msg = await client.messages.create({
        model: MODELS.smart, max_tokens: 8000,
        system: SKETCH_SYSTEM,
        messages: [{ role: "user", content: lastUser.content }],
      });
      let svg = msg.content[0]?.text ?? "";
      svg = svg.replace(/```svg\n?/gi, "").replace(/```\n?/g, "").trim();
      return res.json({ content: "Aquí tienes el plano esquemático:", tool: "sketch", model: MODELS.smart, svg });
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
