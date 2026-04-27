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

// Phase 1: architect produces a JSON layout spec
const ARCHITECT_SYSTEM = `Eres un arquitecto experto en vivienda y edificación. Tu tarea: interpretar un encargo de plano y producir una distribución en planta completa con criterio profesional.

CRITERIOS DE DISEÑO (aplica siempre):
- CTE superficies mínimas: dormitorio simple ≥ 6m², doble ≥ 10m², salón ≥ 14m², cocina ≥ 5m², baño ≥ 3m²
- Proporciones habitaciones: ratio largo/ancho entre 1:1 y 1:2 máximo
- Circulaciones: pasillo ≥ 90cm ancho, recibidor si el programa lo permite
- Zonas día (salón, cocina, comedor) al sur/este; servicio (baños, lavadero) al norte
- Las habitaciones se disponen en cuadrícula, sin solapamientos, formando un rectángulo total
- Todas las medidas en metros con un decimal máximo

RESPUESTA — dos bloques exactos:

[TEXTO]
2-3 frases explicando la distribución adoptada y criterios aplicados. Directo y profesional.
[/TEXTO]

[JSON]
{
  "title": "Nombre del proyecto",
  "width": 10.0,
  "height": 8.0,
  "rooms": [
    {
      "name": "Salon-Comedor",
      "x": 0.0, "y": 0.0, "w": 7.0, "h": 3.5,
      "area": 24.5,
      "doors": ["W:0.5:0.9"],
      "windows": ["S:2.0:1.2"]
    }
  ]
}
[/JSON]

FORMATO doors/windows: "PARED:inicio_m:ancho_m"
PARED: N=arriba S=abajo E=derecha W=izquierda
inicio_m: distancia desde la esquina más cercana de esa pared (≥ 0.2m del extremo)
Las rooms deben cubrir exactamente el rectángulo total (width × height) sin huecos ni solapamientos.`;

// SVG generator — JavaScript calculates all coordinates (no AI arithmetic)
function buildFloorPlanSVG(spec) {
  const CW = 900, CH = 640;
  const ML = 110, MT = 80, MR = 90, MB = 110;
  const DW = CW - ML - MR, DH = CH - MT - MB;

  const scale = Math.min(DW / spec.width, DH / spec.height);
  const X = m => ML + m * scale;
  const Y = m => MT + m * scale;
  const S = m => m * scale;

  const EXT = 9, INT = 3;

  const COLORS = [
    '#e8edf5','#e8f0ea','#f5ece8','#ece8f5',
    '#e8f5f0','#f5f0e8','#f0e8f5','#f5f5e8','#e8f5ec',
  ];

  function sa(str) {
    return String(str)
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\u00f1/g,'n').replace(/\u00d1/g,'N');
  }

  const p = [];
  const push = s => p.push(s);

  push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CW} ${CH}" width="${CW}" height="${CH}" style="background:white">`);
  push(`<defs><style>text{font-family:Arial,Helvetica,sans-serif}</style></defs>`);

  // Exterior wall
  push(`<rect x="${X(0)-EXT}" y="${Y(0)-EXT}" width="${S(spec.width)+EXT*2}" height="${S(spec.height)+EXT*2}" fill="#1a1a1a"/>`);
  push(`<rect x="${X(0)}" y="${Y(0)}" width="${S(spec.width)}" height="${S(spec.height)}" fill="white"/>`);

  // Rooms
  spec.rooms.forEach((r, i) => {
    const rx = X(r.x), ry = Y(r.y), rw = S(r.w), rh = S(r.h);
    const color = COLORS[i % COLORS.length];
    push(`<rect x="${rx.toFixed(1)}" y="${ry.toFixed(1)}" width="${rw.toFixed(1)}" height="${rh.toFixed(1)}" fill="${color}" stroke="#444" stroke-width="${INT}"/>`);

    const cx = (rx + rw / 2).toFixed(1);
    const cy = (ry + rh / 2).toFixed(1);
    const area = r.area != null ? Number(r.area).toFixed(1) : (r.w * r.h).toFixed(1);
    push(`<text x="${cx}" y="${+cy - 6}" font-size="11" text-anchor="middle" fill="#111" font-weight="600">${sa(r.name)}</text>`);
    push(`<text x="${cx}" y="${+cy + 9}" font-size="9" text-anchor="middle" fill="#555">${area} m\u00B2</text>`);
  });

  // Doors
  spec.rooms.forEach(r => {
    (r.doors || []).forEach(d => {
      const [wall, posS, wS] = d.split(':');
      const pos = parseFloat(posS), dw = parseFloat(wS);
      const dpx = S(dw);
      const W_WALL = wall.toUpperCase();

      if (W_WALL === 'N' || W_WALL === 'S') {
        const wy = W_WALL === 'N' ? Y(r.y) : Y(r.y + r.h);
        const dx = X(r.x + pos);
        push(`<rect x="${dx}" y="${wy - EXT - 2}" width="${dpx}" height="${EXT * 2 + 4}" fill="white" stroke="none"/>`);
        const leafY = W_WALL === 'N' ? wy + dpx : wy - dpx;
        push(`<line x1="${dx}" y1="${wy}" x2="${dx}" y2="${leafY}" stroke="#1a1a1a" stroke-width="1.5"/>`);
        const sf = W_WALL === 'N' ? 1 : 0;
        push(`<path d="M ${(dx + dpx).toFixed(1)},${wy} A ${dpx},${dpx} 0 0,${sf} ${dx},${leafY}" fill="none" stroke="#1a1a1a" stroke-width="1" stroke-dasharray="4,3"/>`);
      } else {
        const wx = W_WALL === 'W' ? X(r.x) : X(r.x + r.w);
        const dy = Y(r.y + pos);
        push(`<rect x="${wx - EXT - 2}" y="${dy}" width="${EXT * 2 + 4}" height="${dpx}" fill="white" stroke="none"/>`);
        const leafX = W_WALL === 'W' ? wx + dpx : wx - dpx;
        push(`<line x1="${wx}" y1="${dy}" x2="${leafX}" y2="${dy}" stroke="#1a1a1a" stroke-width="1.5"/>`);
        const sf = W_WALL === 'W' ? 0 : 1;
        push(`<path d="M ${wx},${(dy + dpx).toFixed(1)} A ${dpx},${dpx} 0 0,${sf} ${leafX},${dy}" fill="none" stroke="#1a1a1a" stroke-width="1" stroke-dasharray="4,3"/>`);
      }
    });
  });

  // Windows
  spec.rooms.forEach(r => {
    (r.windows || []).forEach(w => {
      const [wall, posS, wS] = w.split(':');
      const pos = parseFloat(posS), ww = parseFloat(wS);
      const wpx = S(ww);
      const W_WALL = wall.toUpperCase();

      if (W_WALL === 'N' || W_WALL === 'S') {
        const wy = W_WALL === 'N' ? Y(r.y) : Y(r.y + r.h);
        const wx = X(r.x + pos);
        push(`<rect x="${wx}" y="${wy - EXT - 1}" width="${wpx}" height="${EXT * 2 + 2}" fill="white" stroke="none"/>`);
        push(`<rect x="${wx}" y="${wy - EXT}" width="${wpx}" height="${EXT * 2}" fill="none" stroke="#1a1a1a" stroke-width="1.5"/>`);
        const t = wpx / 3;
        for (let k = 0; k < 3; k++) {
          const lx = wx + t * k + t / 2;
          push(`<line x1="${lx.toFixed(1)}" y1="${wy - EXT + 2}" x2="${lx.toFixed(1)}" y2="${wy + EXT - 2}" stroke="#333" stroke-width="1"/>`);
        }
      } else {
        const wx = W_WALL === 'W' ? X(r.x) : X(r.x + r.w);
        const wy = Y(r.y + pos);
        push(`<rect x="${wx - EXT - 1}" y="${wy}" width="${EXT * 2 + 2}" height="${wpx}" fill="white" stroke="none"/>`);
        push(`<rect x="${wx - EXT}" y="${wy}" width="${EXT * 2}" height="${wpx}" fill="none" stroke="#1a1a1a" stroke-width="1.5"/>`);
        const t = wpx / 3;
        for (let k = 0; k < 3; k++) {
          const ly = wy + t * k + t / 2;
          push(`<line x1="${wx - EXT + 2}" y1="${ly.toFixed(1)}" x2="${wx + EXT - 2}" y2="${ly.toFixed(1)}" stroke="#333" stroke-width="1"/>`);
        }
      }
    });
  });

  // Dimension — total width (bottom)
  const dimY = Y(spec.height) + EXT + 32;
  const x0 = X(0), xW = X(spec.width);
  push(`<line x1="${x0}" y1="${dimY}" x2="${xW}" y2="${dimY}" stroke="#666" stroke-width="0.8"/>`);
  push(`<line x1="${x0}" y1="${dimY - 5}" x2="${x0}" y2="${dimY + 5}" stroke="#666" stroke-width="1"/>`);
  push(`<line x1="${xW}" y1="${dimY - 5}" x2="${xW}" y2="${dimY + 5}" stroke="#666" stroke-width="1"/>`);
  push(`<text x="${((x0 + xW) / 2).toFixed(1)}" y="${dimY + 13}" font-size="10" text-anchor="middle" fill="#444">${spec.width.toFixed(2)}m</text>`);

  // Dimension — total height (right)
  const dimX = X(spec.width) + EXT + 32;
  const y0 = Y(0), yH = Y(spec.height);
  push(`<line x1="${dimX}" y1="${y0}" x2="${dimX}" y2="${yH}" stroke="#666" stroke-width="0.8"/>`);
  push(`<line x1="${dimX - 5}" y1="${y0}" x2="${dimX + 5}" y2="${y0}" stroke="#666" stroke-width="1"/>`);
  push(`<line x1="${dimX - 5}" y1="${yH}" x2="${dimX + 5}" y2="${yH}" stroke="#666" stroke-width="1"/>`);
  const dimMY = ((y0 + yH) / 2).toFixed(1);
  push(`<text x="${dimX + 14}" y="${dimMY}" font-size="10" text-anchor="middle" fill="#444" transform="rotate(-90 ${dimX + 14} ${dimMY})">${spec.height.toFixed(2)}m</text>`);

  // North arrow
  const NA = CW - 50, NAy = 55;
  push(`<circle cx="${NA}" cy="${NAy}" r="14" fill="none" stroke="#111" stroke-width="1.2"/>`);
  push(`<polygon points="${NA},${NAy - 11} ${NA - 5},${NAy + 9} ${NA},${NAy + 5} ${NA + 5},${NAy + 9}" fill="#111"/>`);
  push(`<text x="${NA}" y="${NAy - 18}" font-size="10" text-anchor="middle" fill="#111" font-weight="bold">N</text>`);

  // Title block
  const TBx = CW - 220, TBy = CH - 72, TBw = 210, TBh = 62;
  const scaleVal = Math.round(1000 / scale);
  const today = new Date();
  const dd = String(today.getDate()).padStart(2,'0');
  const mm = String(today.getMonth()+1).padStart(2,'0');
  const yyyy = today.getFullYear();
  push(`<rect x="${TBx}" y="${TBy}" width="${TBw}" height="${TBh}" fill="white" stroke="#333" stroke-width="0.8"/>`);
  push(`<line x1="${TBx}" y1="${TBy + 22}" x2="${TBx + TBw}" y2="${TBy + 22}" stroke="#333" stroke-width="0.5"/>`);
  push(`<line x1="${TBx}" y1="${TBy + 42}" x2="${TBx + TBw}" y2="${TBy + 42}" stroke="#333" stroke-width="0.5"/>`);
  push(`<text x="${TBx + TBw/2}" y="${TBy + 15}" font-size="9" text-anchor="middle" fill="#111" font-weight="bold">${sa(spec.title || 'Plano de vivienda')}</text>`);
  push(`<text x="${TBx + TBw/2}" y="${TBy + 35}" font-size="8" text-anchor="middle" fill="#333">Planta baja  |  Esc. 1:${scaleVal}</text>`);
  push(`<text x="${TBx + TBw/2}" y="${TBy + 55}" font-size="8" text-anchor="middle" fill="#555">${dd}/${mm}/${yyyy}</text>`);

  push(`</svg>`);
  return p.join('\n');
}



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
    // ── Sketch (architect → JSON → JS renders SVG) ──
    if (intent === "sketch") {
      const archMsg = await client.messages.create({
        model: MODELS.smart, max_tokens: 1500,
        system: ARCHITECT_SYSTEM,
        messages: [{ role: "user", content: lastUser.content }],
      });
      const archResponse = archMsg.content[0]?.text ?? "";

      // Extract user-facing text
      const textMatch = archResponse.match(/\[TEXTO\]([\s\S]*?)\[\/TEXTO\]/i);
      const userText  = textMatch ? textMatch[1].trim() : "";

      // Extract JSON spec
      const jsonMatch = archResponse.match(/\[JSON\]([\s\S]*?)\[\/JSON\]/i);
      if (!jsonMatch) {
        return res.json({
          content: userText || "No pude generar la distribución. Intenta con más detalle (m², número de habitaciones, dimensiones).",
          tool: "chat", model: MODELS.smart,
        });
      }

      let spec;
      try {
        spec = JSON.parse(jsonMatch[1].trim());
      } catch {
        return res.json({
          content: userText || "Error procesando la distribución. Intenta de nuevo.",
          tool: "chat", model: MODELS.smart,
        });
      }

      const svg = buildFloorPlanSVG(spec);
      return res.json({
        content: userText || "Aquí tienes el plano:",
        tool: "sketch", model: MODELS.smart,
        svg,
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
