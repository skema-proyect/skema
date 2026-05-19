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
- Las respuestas deben tener la longitud justa: ni telegráficas ni exhaustivas

Capacidades integradas — IMPORTANTE:
- Tienes acceso real a la agenda del usuario. Cuando te pidan agendar algo, responde confirmando que lo has añadido. NUNCA digas "no tengo acceso a tu agenda", "no puedo crear eventos" ni nada parecido — eso es falso. El sistema lo gestiona automáticamente en segundo plano.`;

const NORMATIVA_SYSTEM = `${SYSTEM}

MODO NORMATIVA ACTIVO:
Responde como consultor experto en normativa urbanística de Gran Canaria.
Cita artículos, planes y normas específicas cuando sea posible.
Si hay ambigüedad, indícalo y orienta a la fuente oficial.

DATOS DE PARCELA: Si el contexto incluye bloques [DATOS CATASTRALES OFICIALES] o [PLANEAMIENTO URBANÍSTICO — SITCAN], úsalos como base de tu respuesta y cita la referencia catastral. NO digas al usuario que busque en el Catastro o el SITCAN si ya tienes esos datos aquí — da la respuesta directamente con lo que tienes. Solo remite al visor o a la oficina técnica si los datos de planeamiento no están disponibles en el contexto.`;

const DOCUMENT_SYSTEM = `${SYSTEM}

MODO REDACCIÓN ACTIVO:
Genera documentos profesionales estructurados.
Elimina las muletillas del lenguaje hablado.
Usa formato claro con secciones, bullet points donde sea eficiente.`;

// Sketch conversation — discuss changes in text, no generation
const SKETCH_CHAT_SYSTEM = `Eres un arquitecto experto trabajando con un cliente en la definición de un plano de planta.

TU ROL:
- Escucha y confirma con tus palabras lo que pide el usuario
- Si hay varios cambios, analiza si son compatibles entre sí y señala conflictos si los hay
- Si algo es ambiguo, pregunta antes de asumir
- Cuando tengáis todo claro, ofrece generar el plano

REGLA CRÍTICA SOBRE GENERACIÓN:
- Tú NO generas SVG, código ni planos. Eso lo hace otro sistema cuando recibe la señal.
- Si el usuario te pide que generes o dice que puedes hacerlo, respóndele: "Perfecto, lo lanzo ahora." y añade [GENERATE] al final.
- Si el usuario confirma con "sí", "ok", "dale", "venga", "perfecto", "adelante" u otra confirmación positiva después de que hayas ofrecido generarlo, responde brevemente y añade [GENERATE] al final.

CUÁNDO AÑADIR [GENERATE]:
- Usuario confirma cambios y da luz verde → [GENERATE]
- Usuario dice explícitamente que quieres el plano → [GENERATE]
- En cualquier otra situación → NO añadas [GENERATE], solo habla

Tono: directo, profesional, como un arquitecto en reunión. Sin muletillas.`;

// Phase 1: architect produces a JSON layout spec
const ARCHITECT_SYSTEM = `Eres un arquitecto y delineante experto en vivienda. Tu única función en esta conversación es generar y refinar distribuciones en planta.

REGLA ABSOLUTA: SIEMPRE respondes con los dos bloques [TEXTO] y [JSON]. Nunca te niegas, nunca dices que no puedes. Si falta información, asumes valores estándar y lo explicas.

Si el historial tiene un plano anterior, lee qué se construyó, aplica los cambios pedidos, y genera el plano actualizado.
Si es el primer plano, interpreta el encargo y propón la mejor distribución posible.

CRITERIOS DE DISEÑO:
- CTE: dormitorio simple ≥ 6m², doble ≥ 10m², salón ≥ 14m², cocina ≥ 5m², baño ≥ 3m²
- Las rooms forman un rectángulo total sin huecos ni solapamientos (como un puzzle)
- Accesos lógicos: entrada → pasillo → habitaciones; nunca pasar por dormitorios para llegar a otros
- Zonas día al sur/este, servicio al norte
- Proporciones: ratio largo/ancho entre 1:1 y 1:2
- Todas las medidas con un decimal máximo

FORMATO DE RESPUESTA — exactamente estos dos bloques:

[TEXTO]
2-3 frases explicando la distribución y cambios aplicados.
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
inicio_m: distancia desde esquina más cercana (mínimo 0.2m del extremo)
VERIFICACIÓN OBLIGATORIA antes de escribir el JSON: suma de áreas de rooms ≈ width × height (tolerancia muros ±10%)
Cada room ocupa su posición exacta: x+w ≤ width, y+h ≤ height, sin solapamientos.`;

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

// ── Catastro + SITCAN — datos reales de parcela ───────────────────────────────

// La API del Catastro espera texto sin acentos y en mayúsculas
function normCatastro(s) {
  return String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim();
}

// Municipios de Gran Canaria para reconocimiento por nombre
const GC_MUNICIPIOS = [
  "santa lucia de tirajana", "las palmas de gran canaria", "telde", "ingenio",
  "mogan", "agaete", "arucas", "galdar", "guia", "firgas", "teror", "valsequillo",
  "san bartolome de tirajana", "aguimes", "santa brigida", "vega de san mateo",
  "tejeda", "artenara", "la aldea de san nicolas", "tias", "yaiza", "arrecife",
];
const TF_MUNICIPIOS = [
  "santa cruz de tenerife", "la laguna", "la orotava", "los realejos",
  "adeje", "arona", "guimar", "icod", "garachico", "buenavista",
];

// Extrae dirección mediante regex — sin dependencia de LLM para el caso común
function extractAddressRegex(message) {
  const norm = message.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

  const TIPOS = {
    calle:"CL","c/":"CL",cl:"CL",avenida:"AV",avda:"AV","av.":"AV",
    plaza:"PZ",camino:"CM",carretera:"CR",ctra:"CR",paseo:"PS",
    urbanizacion:"UR","urb.":"UR",urb:"UR",pasaje:"PJ",vereda:"VR",
  };

  // tipo_via + nombre + [,] + [numero|nº] + dígitos
  const viaRe = /\b(calle|avenida|avda?\.?|c\/|cl\b|plaza|camino|carretera|ctra\.?|paseo|urbanizacion|urb\.?|pasaje|vereda)\s+([a-z][a-z\s\-]{0,35}?)\s*(?:,\s*)?(?:(?:numero|num\.?|n[°º]|no\.?)\s*)?(\d+)/;
  const vm = norm.match(viaRe);
  if (!vm) return null;

  const tipoKey = vm[1].replace(/\.$/, "");
  const tipo    = TIPOS[tipoKey] || "CL";
  const nombre  = vm[2].trim();
  const numero  = vm[3];
  if (!nombre || nombre.length < 2) return null;

  // Municipio: "ayuntamiento de X" o "municipio de X"
  let municipio = norm.match(/(?:ayuntamiento|municipio|termino\s+municipal)\s+de\s+([a-z][a-z\s]{2,40}?)(?:\s*[,.]|$)/)?.[1]?.trim() ?? null;

  // Fallback: buscar nombre de municipio conocido en el texto
  if (!municipio) {
    for (const m of [...GC_MUNICIPIOS, ...TF_MUNICIPIOS]) {
      if (norm.includes(m)) { municipio = m; break; }
    }
  }

  if (!municipio) return null;

  const isTF = TF_MUNICIPIOS.some(m => norm.includes(m));
  return {
    tiene_direccion: true,
    provincia: isTF ? "SANTA CRUZ DE TENERIFE" : "LAS PALMAS",
    municipio,
    tipo_via: tipo,
    nombre_via: nombre,
    numero: numero ?? null,
    _source: "regex",
  };
}

// Extrae componentes de dirección — regex primero, Haiku como fallback
async function extractAddress(message) {
  const fast = extractAddressRegex(message);
  if (fast) return fast;

  // Haiku solo si el regex no encontró nada
  const msg = await client.messages.create({
    model: MODELS.fast, max_tokens: 120,
    system: `Reply ONLY with a JSON object, no other text.
If there is a street address: {"tiene_direccion":true,"provincia":"LAS PALMAS","municipio":"SANTA LUCIA DE TIRAJANA","tipo_via":"CL","nombre_via":"TERUEL","numero":"11"}
Otherwise: {"tiene_direccion":false}`,
    messages: [{ role: "user", content: message }],
  });
  try {
    const text  = msg.content[0].text.trim();
    const start = text.indexOf("{");
    if (start === -1) return { tiene_direccion: false };
    return JSON.parse(text.slice(start));
  } catch { return { tiene_direccion: false }; }
}

// Consulta la Sede Electrónica del Catastro por dirección → referencia catastral + coords UTM
async function lookupCatastro(addr) {
  try {
    const params = new URLSearchParams({
      Provincia: normCatastro(addr.provincia ?? "LAS PALMAS"),
      Municipio: normCatastro(addr.municipio),
      SiglaVia:  normCatastro(addr.tipo_via  ?? "CL"),
      NombreVia: normCatastro(addr.nombre_via),
    });
    if (addr.numero) params.set("Numero", String(addr.numero));

    const res = await fetch(
      `https://ovc.catastro.meh.es/OVCServWeb/OVCWcfLibres/REST/OVCCallejero.svc/Consulta_DNPRC?${params}`,
      { signal: AbortSignal.timeout(8000) }
    );
    const xml = await res.text();

    const pc1 = xml.match(/<pc1>([^<]+)<\/pc1>/)?.[1]?.trim();
    const pc2  = xml.match(/<pc2>([^<]+)<\/pc2>/)?.[1]?.trim();
    if (!pc1) return { _err: xml.match(/<err>([^<]*)<\/err>/)?.[1]?.trim() ?? "sin_resultado" };

    const xcen = parseFloat(xml.match(/<xcen>([^<]+)<\/xcen>/)?.[1] ?? "NaN");
    const ycen = parseFloat(xml.match(/<ycen>([^<]+)<\/ycen>/)?.[1] ?? "NaN");
    const ldt  = xml.match(/<ldt>([^<]+)<\/ldt>/)?.[1]?.trim() ?? "";

    return {
      refCatastral: pc1 + pc2,
      xcen: isNaN(xcen) ? null : xcen,
      ycen: isNaN(ycen) ? null : ycen,
      direccion: ldt,
    };
  } catch (e) { return { _err: e.message }; }
}

// Consulta detalle de parcela por referencia catastral (uso, superficie)
async function lookupCatastroDetalle(refCatastral) {
  try {
    const res = await fetch(
      `https://ovc.catastro.meh.es/OVCServWeb/OVCWcfLibres/REST/OVCCallejero.svc/Consulta_DNPPP?RC=${encodeURIComponent(refCatastral)}`,
      { signal: AbortSignal.timeout(6000) }
    );
    const xml = await res.text();
    const luso = xml.match(/<luso>([^<]+)<\/luso>/)?.[1]?.trim();  // uso (Residencial, Industrial…)
    const stl  = xml.match(/<stl>([^<]+)<\/stl>/)?.[1]?.trim();   // superficie total suelo m²
    const sfc  = xml.match(/<sfc>([^<]+)<\/sfc>/)?.[1]?.trim();   // superficie construida m²
    return luso ? { uso: luso, supSuelo: stl, supConst: sfc } : null;
  } catch { return null; }
}

// Consulta calificación urbanística vía SITCAN/IDE Canarias WFS — best effort
async function lookupSITCAN(xcen, ycen) {
  if (!xcen || !ycen) return null;
  const buf  = 10;
  const bbox = `${xcen - buf},${ycen - buf},${xcen + buf},${ycen + buf}`;

  // Candidatos: varios endpoints y layer names — probamos hasta encontrar respuesta
  const candidates = [
    { base: "https://visor.sitcan.es/sitcan/ows",          layer: "SITCAN:PGOU_CALIFICACION_GC"    },
    { base: "https://visor.sitcan.es/sitcan/ows",          layer: "SITCAN:CALIFICACION_SUELO_GC"   },
    { base: "https://visor.sitcan.es/sitcan/ows",          layer: "SITCAN:CLASIFICACION_SUELO_GC"  },
    { base: "https://visor.sitcan.es/sitcan/ows",          layer: "SITCAN:PLANEAMIENTO_GC"         },
    { base: "https://idecan2.grafcan.es/ServicioWFS/wfs",  layer: "GC_PGOU:Calificacion_Suelo"     },
    { base: "https://idecan2.grafcan.es/ServicioWFS/wfs",  layer: "GC:Calificacion_Suelo"          },
    { base: "https://idecan1.grafcan.es/ServicioWFS/wfs",  layer: "GC_PGOU:Calificacion_Suelo"     },
  ];

  for (const { base, layer } of candidates) {
    try {
      const url = `${base}?SERVICE=WFS&REQUEST=GetFeature&VERSION=2.0.0&TYPENAMES=${encodeURIComponent(layer)}&SRSNAME=EPSG:32628&BBOX=${bbox},EPSG:32628&outputFormat=application%2Fjson`;
      const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
      if (!res.ok) continue;
      const json = await res.json();
      if (json.features?.length > 0) {
        return { layer, props: json.features[0].properties };
      }
    } catch { continue; }
  }
  return null;
}

// ── Intent detection (structured tasks) ───────────────────────────────────────
function detectIntent(message) {
  if (
    /\b(plano|planta|croquis|esquema)\b/i.test(message) && (
      /\d+\s*[x×]\s*\d+|\d+\s*(m[²2]?|metro|cm)/i.test(message) ||
      /\b(genera|crea|haz|dibuja|actualiza|modifica|cambia|regenera|nuevo|siguiente|ahora)\b/i.test(message)
    )
  ) return "sketch";

  if (/\b(normativa|pgou?|ayuntamiento|urbanismo|edificaci|licencia|retranqueo|altura.*máxim|coeficiente|parcela|uso.*suelo|pgm|catálogo|edificabilidad|aprovechamiento|cuantas.*plantas|plantas.*construir|puedo.*construir|construir.*terreno|construir.*solar|suelo.*urban|suelo.*rural|catastro|referencia catastral)\b/i.test(message))
    return "normativa";

  if (/\b(redacta|escribe un|genera un|elabora un).{0,20}(informe|acta|nota|resumen|documento)/i.test(message))
    return "document";

  // Normalizar acentos — ̀-ͯ cubre todos los diacríticos combinados
  const n = message.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

  if (
    /\bagend\w+/.test(n) ||                                                                          // agend* — agendar, agéndame, agendes, agendemos...
    /\b(agenda|calendario)\b/.test(n) ||                                                             // palabra exacta
    /\b(anota|apunta|pon|mete|guarda|anade|anadir)\b.{0,40}\b(agenda|calendario)\b/.test(n) ||      // verbo + agenda
    /\b(recordatorio|recuerdame|ponme.{0,20}(cita|reunion)|programa.{0,25}(reuni|cita)|reserva.{0,20}cita)\b/.test(n) ||
    /\b(reunion|cita|llamada|visita|evento)\b.{0,60}\b(manana|hoy|lunes|martes|miercoles|jueves|viernes|sabado|domingo|\d{1,2})\b/.test(n) ||
    /\b(tengo|hay|tenemos|quiero|necesito)\b.{0,40}\b(reunion|cita|llamada|visita|evento)\b/.test(n) ||
    /\b(ponme|apuntame|meteme|pon|mete)\b.{0,30}\b(manana|hoy|lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b/.test(n) ||  // "ponme mañana X"
    /\b(ponme|apuntame|meteme|pon|mete)\b.{0,50}\ba\s+las?\s+\d/.test(n)                            // "ponme para... a las X"
  )
    return "agenda";

  if (
    /\b(crea|crear|nueva|nuevo|escribe|escribir|guarda|guardar|haz|hacer)\b.{0,30}\bnota\b/.test(n) ||
    /\bnota\b.{0,30}\b(nueva|sobre|con|titulo|titulada)\b/.test(n) ||
    /\banota\b.{0,40}(esto|lo siguiente|lo que|que)/.test(n)
  )
    return "nota";

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

  const { messages = [], projectInstructions, today } = req.body;
  if (!messages.length) return res.status(400).json({ error: "Sin mensajes" });

  const projectContext = projectInstructions?.trim()
    ? `\n\nCONTEXTO DEL PROYECTO:\n${projectInstructions.trim()}`
    : "";

  // Si en la conversación ya se crearon eventos, informar a Claude para que no se contradiga
  const hasAgendaHistory = messages.some(m => m.role === "assistant" && m.tool === "agenda");
  const agendaHistoryNote = hasAgendaHistory
    ? "\n\nNOTA DE SISTEMA: En esta conversación ya has creado eventos en la agenda del usuario mediante el sistema integrado. Si el usuario pregunta si funcionó o cuestiona tu capacidad, confirma que sí — los eventos están guardados."
    : "";

  const lastUser = [...messages].reverse().find(m => m.role === "user");
  if (!lastUser) return res.status(400).json({ error: "Sin mensaje de usuario" });

  // If any previous message in this conversation was a sketch, stay in sketch mode
  const isSketchConversation = messages.some(m => m.tool === "sketch");
  let intent = isSketchConversation ? "sketch" : detectIntent(lastUser.content);

  // Si ya había interacción de agenda Y el usuario da detalles (fecha/hora/título), mantener en agenda
  if (intent === "chat" && hasAgendaHistory) {
    const n2 = lastUser.content.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    const hasDateTime = /\b(manana|hoy|lunes|martes|miercoles|jueves|viernes|sabado|domingo|\d{1,2}\s+de|\d{1,2}:\d{2}|a\s+las?\s+\d)\b/.test(n2);
    const hasEventDetail = /\b(titulo|titulo:|fecha|fecha:|hora|hora:|reunion|cita|llamada|visita|evento|con\s+el|con\s+la|con\s+don|con\s+dona)\b/.test(n2);
    if (hasDateTime || hasEventDetail) intent = "agenda";
  }
  const history = messages.map(m => ({ role: m.role, content: m.content }));
  const _debug = { intent, msg: lastUser.content.slice(0, 60) };

  try {
    // ── Agenda — extraer evento y confirmar ──────────────────────────────────────
    if (intent === "agenda") {
      const todayStr = today ?? new Date().toISOString().split("T")[0];
      const extraction = await client.messages.create({
        model: MODELS.fast,
        max_tokens: 400,
        system: `Eres un asistente que extrae eventos de calendario de mensajes en español.
Hoy es ${todayStr}. Resuelve fechas relativas (mañana, el martes, la próxima semana...) a fechas absolutas.

Devuelve ÚNICAMENTE un JSON válido con este formato (sin texto extra):
{
  "title": "título conciso del evento",
  "date": "YYYY-MM-DD",
  "start_time": "HH:MM o null",
  "end_time": "HH:MM o null",
  "description": "descripción breve o null",
  "message": "confirmación natural en una frase, ej: Apuntado. Reunión con el cliente el martes 20 a las 10:00."
}

Si no hay suficiente información para crear el evento, devuelve:
{ "error": "motivo breve" }`,
        messages: [{ role: "user", content: lastUser.content }],
      });

      let parsed = null;
      try {
        const raw  = extraction.content[0].text.trim();
        const start = raw.indexOf("{");
        if (start !== -1) parsed = JSON.parse(raw.slice(start, raw.lastIndexOf("}") + 1));
      } catch {}

      if (parsed && !parsed.error && parsed.title && parsed.date) {
        return res.json({
          content:   parsed.message ?? `Evento "${parsed.title}" añadido a tu agenda.`,
          tool:      "agenda",
          model:     MODELS.fast,
          _debug,
          eventData: {
            title:           parsed.title,
            date:            parsed.date,
            startTime:       parsed.start_time  ?? undefined,
            endTime:         parsed.end_time    ?? undefined,
            description:     parsed.description ?? undefined,
            color:           "#000000",
            reminderMinutes: 30,
          },
        });
      }
      // No pudo extraer — pedir aclaración directamente, sin pasar por Claude
      const reason = parsed?.error ?? "no pude interpretar el evento";
      const rawText = extraction.content[0]?.text ?? "";
      return res.json({
        content: `Para añadirlo a la agenda necesito un poco más de detalle: ${reason}. ¿Puedes indicarme el título, la fecha y la hora?`,
        tool: "agenda",
        model: MODELS.fast,
        _debug: { ..._debug, parsed, rawText },
      });
    }

    // ── Nota — extraer título y contenido ──────────────────────────────────────
    if (intent === "nota") {
      const extraction = await client.messages.create({
        model: MODELS.fast,
        max_tokens: 600,
        system: `Eres un asistente que crea notas a partir de mensajes en español.
Extrae el título y el contenido de la nota pedida por el usuario.

Devuelve ÚNICAMENTE un JSON válido (sin texto extra):
{
  "title": "título conciso de la nota",
  "content": "contenido completo de la nota en texto plano",
  "message": "confirmación breve, ej: Nota guardada."
}

Si el usuario no especificó título, genera uno conciso a partir del contenido.
Si no hay contenido suficiente:
{ "error": "motivo breve" }`,
        messages: [{ role: "user", content: lastUser.content }],
      });

      let parsed = null;
      try {
        const raw   = extraction.content[0].text.trim();
        const start = raw.indexOf("{");
        if (start !== -1) parsed = JSON.parse(raw.slice(start, raw.lastIndexOf("}") + 1));
      } catch {}

      if (parsed && !parsed.error && parsed.title) {
        return res.json({
          content:  parsed.message ?? "Nota guardada.",
          tool:     "nota",
          model:    MODELS.fast,
          _debug,
          noteData: {
            title:   parsed.title,
            content: parsed.content ?? "",
          },
        });
      }

      const reason = parsed?.error ?? "no pude entender el contenido de la nota";
      return res.json({
        content: `Para crear la nota necesito un poco más de detalle: ${reason}. ¿Puedes indicarme el título y el contenido?`,
        tool: "nota",
        model: MODELS.fast,
        _debug,
      });
    }

    // ── Sketch (architect → JSON → JS renders SVG) ──
    if (intent === "sketch") {
      // Extract the LATEST spec from history (ignore older ones)
      const allSpecs = history
        .filter(m => m.role === "assistant" && m.content?.includes("<!--SPEC:"))
        .map(m => m.content?.match(/<!--SPEC:([\s\S]*?)-->/)?.[1]?.trim())
        .filter(Boolean);
      const prevSpecJSON = allSpecs[allSpecs.length - 1] ?? null;

      // Clean history — strip ALL spec comments to prevent context pollution
      const cleanHistory = history.map(m => ({
        role: m.role,
        content: (m.content ?? "").replace(/\n*<!--SPEC:[\s\S]*?-->/g, "").trim(),
      }));

      // ── Decision: discuss or generate? ──
      // If there's already a plan AND the user isn't explicitly asking to generate → discuss in text
      const GENERATE_TRIGGER = /\b(genera|aplica|hazlo|dibuja|dale|venga|adelante|muéstrame|crea|actualiza|sí genera|ok genera|sí aplica|ok aplica|confirmo|ejecuta)\b/i;
      const hasExistingPlan = prevSpecJSON !== null;

      if (hasExistingPlan && !GENERATE_TRIGGER.test(lastUser.content)) {
        const discussMsg = await client.messages.create({
          model: MODELS.smart, max_tokens: 500,
          system: SKETCH_CHAT_SYSTEM + projectContext,
          messages: cleanHistory,
        });
        const discussText = discussMsg.content[0]?.text ?? "";

        // If the discussion model decided it's time to generate, fall through to pipeline
        if (!discussText.includes("[GENERATE]")) {
          return res.json({
            content: discussText,
            tool: "chat", model: MODELS.smart,
          });
        }
        // Strip the marker from the displayed text and continue to generation below
        // (fall through with cleanHistory and prevSpecJSON already set)
      }

      // Build architect system — inject last spec cleanly
      const archSystem = prevSpecJSON
        ? `${ARCHITECT_SYSTEM}

═══ PLANO ACTUAL EN PANTALLA ═══
${prevSpecJSON}
═══════════════════════════════

INSTRUCCIÓN CRÍTICA para cambios:
1. Lee el último mensaje del usuario e identifica EXACTAMENTE qué quiere cambiar
2. Lista internamente cada cambio antes de aplicarlo
3. Aplica cada cambio verificando que no rompe las dimensiones totales ni crea solapamientos
4. Todo lo que el usuario NO mencionó queda IDÉNTICO al JSON de arriba
5. No añadas ni quites habitaciones salvo que se pida explícitamente`
        : ARCHITECT_SYSTEM;

      // When refining an existing plan, only send the last 6 messages to the architect
      // — avoids confusion between old change rounds and the current request
      const archHistory = prevSpecJSON ? cleanHistory.slice(-6) : cleanHistory;

      const archMsg = await client.messages.create({
        model: MODELS.smart, max_tokens: 1500,
        system: archSystem,
        messages: archHistory,
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
      // Embed spec as hidden HTML comment so future calls can recover it
      const specComment = `<!--SPEC:${JSON.stringify(spec)}-->`;
      return res.json({
        content: `${userText || "Aquí tienes el plano:"}\n\n${specComment}`,
        tool: "sketch", model: MODELS.smart,
        svg,
      });
    }

    // ── Normativa ──
    if (intent === "normativa") {
      // Check if message likely contains a street address (avoid extra Haiku call otherwise)
      const hasAddressHint = /\b(calle|avda?\.?|avenida|camino|carretera|plaza|c\/|nº|num|número|\bno\b\.?\s*\d|polígono|urb\.?|urbanización)\b|\d{1,4}[,\s]/i.test(lastUser.content);

      // DB lookup + address extraction run in parallel
      const [dbContext, addr] = await Promise.all([
        lookupNormativa(lastUser.content),
        hasAddressHint ? extractAddress(lastUser.content) : Promise.resolve({ tiene_direccion: false }),
      ]);

      // Catastro → SITCAN (sequential, each needs the previous result)
      let parcelBlock = "";
      const normDebug = { hasAddressHint, addr: addr.tiene_direccion ? addr : null };

      if (addr.tiene_direccion) {
        const parcel = await lookupCatastro(addr);
        normDebug.catastro = parcel;

        if (parcel && parcel.refCatastral) {
          // Fetch parcel detail and SITCAN in parallel
          const [detalle, zoning] = await Promise.all([
            lookupCatastroDetalle(parcel.refCatastral),
            lookupSITCAN(parcel.xcen, parcel.ycen),
          ]);
          normDebug.detalle = detalle;
          normDebug.sitcan  = zoning;

          parcelBlock = `[DATOS CATASTRALES OFICIALES — Sede Electrónica del Catastro]
Referencia catastral: ${parcel.refCatastral}
Dirección registrada: ${parcel.direccion}${detalle ? `
Uso catastral: ${detalle.uso ?? "–"}
Superficie suelo: ${detalle.supSuelo ? detalle.supSuelo + " m²" : "–"}
Superficie construida: ${detalle.supConst ? detalle.supConst + " m²" : "–"}` : ""}
Enlace ficha: https://www1.sedecatastro.gob.es/CYCBienInmueble/OVCConCiud.aspx?RefC=${parcel.refCatastral}`;

          if (zoning) {
            const props = Object.entries(zoning.props)
              .filter(([, v]) => v !== null && v !== "")
              .map(([k, v]) => `  ${k}: ${v}`)
              .join("\n");
            parcelBlock += `\n\n[PLANEAMIENTO URBANÍSTICO — SITCAN (${zoning.layer})]\n${props}`;
          }
        }
      }

      const system = [
        dbContext ? `${NORMATIVA_SYSTEM}\n\n${dbContext}` : NORMATIVA_SYSTEM,
        parcelBlock ? `\n\n${parcelBlock}` : "",
        projectContext,
      ].join("");

      const msg = await client.messages.create({
        model: MODELS.smart, max_tokens: 2048,
        system, messages: history,
      });
      return res.json({ content: msg.content[0]?.text ?? "", tool: "normativa", model: MODELS.smart, _debug: normDebug });
    }

    // ── Document ──
    if (intent === "document") {
      const msg = await client.messages.create({
        model: MODELS.smart, max_tokens: 3000,
        system: DOCUMENT_SYSTEM + projectContext, messages: history,
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
      system: SYSTEM + projectContext + agendaHistoryNote, messages: history,
    });
    return res.json({ content: msg.content[0]?.text ?? "", tool: "chat", model, _debug });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
