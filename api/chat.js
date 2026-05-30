import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import mammoth from "mammoth";
import * as XLSX from "xlsx";
import { runFloorPlanPipeline } from "./lib/floorplan-pipeline.js";

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

MODO NORMATIVA ACTIVO — CONSULTOR URBANÍSTICO:
Eres el primer filtro de consulta de un estudio de arquitectura. Tu función es dar una orientación rápida, concreta y útil. No eres un organismo oficial — eres el colega experto que da una primera lectura antes de ir a los trámites.

REGLA PRINCIPAL: SIEMPRE da un veredicto concreto con números. Nunca te quedes en "depende" o "hay que consultar". Si tienes datos parciales, da el rango más probable marcándolo como estimación no oficial. Si no hay datos de ninguna fuente, usa tu conocimiento del planeamiento canario para el municipio igualmente.

FORMATO DE RESPUESTA OBLIGATORIO cuando hay consulta sobre parcela:
Usa exactamente estas cuatro secciones, en este orden:

**📍 Parcela**
Referencia catastral · m² suelo · m² construido · uso catastral
[Ver ficha en Catastro](enlace del campo "Enlace ficha" si está disponible) — muéstralo siempre como link clicable

**🏗️ Estimación urbanística** ⚠️ *No oficial*
Zona según PGOU · número de plantas · altura máxima · edificabilidad orientativa

**🏘️ Entorno inmediato**
Si hay datos de [ENTORNO INMEDIATO], úsalos literalmente. Indica la altura predominante y el rango.
Añade: para una parcela de ~Xm² en esa zona, la tipología compatible suele ser [tu interpretación].
Si no hay datos de entorno, usa tu conocimiento de la trama urbana del municipio.

**📄 Documentos PGOU**
Si hay links de GRAFCAN, uno por línea con una frase que explique qué regula cada documento.
Si no hay links, indica qué documento habría que pedir y a quién (cédula urbanística en el Ayuntamiento de X).

DATOS: Si el contexto incluye [DATOS CATASTRALES OFICIALES], [PLANEAMIENTO URBANÍSTICO — GRAFCAN] o [ENTORNO INMEDIATO], úsalos. No digas al usuario que busque en ningún visor si ya tienes los datos.

M² PROPORCIONADOS POR EL USUARIO: Si en el mensaje o en el historial el usuario indica los m² de la parcela (ej: "son 120 metros", "la parcela tiene 150m²", "mide 200 m²"), úsalos como dato real para calcular:
- Edificabilidad total = m² parcela × coeficiente del PGOU estimado para esa zona
- Número de plantas compatible según esa superficie y la tipología dominante
- Da el resultado con convicción: "con 120m² y un coeficiente estimado de 2,5, tienes ~300m² construibles, compatible con PB+3"
Indica siempre que es una estimación no oficial basada en los datos aportados.`;

const DOCUMENT_SYSTEM = `${SYSTEM}

MODO REDACCIÓN ACTIVO — COAUTOR PROFESIONAL:

Tu función es generar, corregir y mejorar textos y documentos profesionales. Actúas como coautor, no como transcriptor.

REGLAS DE CALIDAD — siempre, sin excepción:
- Corrige todos los errores ortográficos y gramaticales del texto dictado o escrito
- Mejora la redacción si está confusa, incompleta o poco profesional — sin cambiar el sentido
- Elimina repeticiones, muletillas y lenguaje oral
- Si el texto dictado es un borrador caótico, organízalo con estructura lógica
- Si falta información necesaria para un documento (partes, fechas, datos), señálalo brevemente al final

FORMATO — inamovible salvo que el usuario lo pida explícitamente:
- Sin emojis, sin colores, sin decoración visual
- Blanco y negro, tipografía limpia
- Usa encabezados, secciones y listas solo cuando la estructura del documento lo requiere
- Sin frases de relleno al inicio ("Claro, aquí tienes...", "Por supuesto...")

MODO ITERATIVO:
- Cuando el usuario pide cambios, devuelve siempre el documento COMPLETO actualizado, nunca solo el fragmento modificado
- El documento que se muestra en pantalla es el que se descargará — no hay versión diferente

AL TERMINAR (cuando el usuario dé el visto bueno o el documento esté listo):
Pregunta exactamente esto, sin añadir nada más:
"¿Lo descargamos o lo guardamos? Para descarga: PDF, Word o Excel (si hay tablas). Para guardar: en Notas o en un Proyecto."`;





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

// WGS84 → UTM Zone 28N (EPSG:32628) — conversión matemática pura, sin API
function wgs84ToUtm28N(lat, lon) {
  const a  = 6378137.0;
  const f  = 1 / 298.257223563;
  const e2 = 2 * f - f * f;
  const k0 = 0.9996;
  const lon0 = -15 * Math.PI / 180; // meridiano central zona 28
  const FE = 500000;

  const phi    = lat * Math.PI / 180;
  const lam    = lon * Math.PI / 180;
  const sinPhi = Math.sin(phi), cosPhi = Math.cos(phi), tanPhi = Math.tan(phi);

  const N = a / Math.sqrt(1 - e2 * sinPhi * sinPhi);
  const T = tanPhi * tanPhi;
  const C = (e2 / (1 - e2)) * cosPhi * cosPhi;
  const A = cosPhi * (lam - lon0);
  const A2 = A*A, A3 = A2*A, A4 = A2*A2, A5 = A4*A, A6 = A4*A2;

  const e4 = e2*e2, e6 = e4*e2;
  const M = a * (
    (1 - e2/4 - 3*e4/64 - 5*e6/256) * phi
    - (3*e2/8 + 3*e4/32 + 45*e6/1024) * Math.sin(2*phi)
    + (15*e4/256 + 45*e6/1024)         * Math.sin(4*phi)
    - (35*e6/3072)                      * Math.sin(6*phi)
  );

  const eP2 = e2 / (1 - e2);
  const x = k0 * N * (A + (1-T+C)*A3/6 + (5-18*T+T*T+72*C-58*eP2)*A5/120) + FE;
  const y = k0 * (M + N*tanPhi*(A2/2 + (5-T+9*C+4*C*C)*A4/24 + (61-58*T+T*T+600*C-330*eP2)*A6/720));

  return { x: Math.round(x), y: Math.round(y) };
}

// WGS84 → EPSG:3857 (Web Mercator) — para OVCListaBienes.aspx en www1.sedecatastro.gob.es
function wgs84ToWebMercator(lat, lon) {
  const R = 6378137.0;
  const x = (lon * Math.PI / 180) * R;
  const y = Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI / 180) / 2)) * R;
  return { x: x.toFixed(2), y: y.toFixed(2) };
}

// Scraping de OVCListaBienes.aspx — único host accesible desde Frankfurt
// Parser compartido para OVCListaBienes — extrae referencia catastral del HTML
function parseListaBienesHtml(html, finalUrl) {
  let refCatastral =
    html.match(/[Rr]ef[Cc]=([A-Za-z0-9]{14,20})/)?.[1]?.toUpperCase() ??
    html.match(/refcat=([A-Za-z0-9]{14,20})/i)?.[1]?.toUpperCase() ??
    null;

  if (!refCatastral && finalUrl?.includes("RefC=")) {
    refCatastral = finalUrl.match(/RefC=([A-Za-z0-9]{14,20})/i)?.[1]?.toUpperCase() ?? null;
  }

  if (!refCatastral) {
    if (/no hay inmuebles/i.test(html)) return { _noParcel: true };
    return null;
  }

  const xcenMatch = html.match(/xcen[^0-9]{0,10}([4-6]\d{5}(?:\.\d+)?)/i);
  const ycenMatch = html.match(/ycen[^0-9]{0,10}(3\d{6}(?:\.\d+)?)/i);

  return {
    refCatastral,
    xcen: xcenMatch ? parseFloat(xcenMatch[1]) : null,
    ycen: ycenMatch ? parseFloat(ycenMatch[1]) : null,
    _source: "catastro-web",
  };
}

// Busca en OVCListaBienes por dirección — GET para obtener VIEWSTATE + POST para ejecutar búsqueda
async function lookupCatastroWebByAddress(addr) {
  try {
    const prov  = normCatastro(addr.provincia ?? "LAS PALMAS");
    const mun   = normCatastro(addr.municipio ?? "");
    const sigla = normCatastro(addr.tipo_via  ?? "CL");
    const via   = normCatastro(addr.nombre_via ?? "");
    const num   = addr.numero ? String(addr.numero) : "";

    const url = `https://www1.sedecatastro.gob.es/CYCBienInmueble/OVCListaBienes.aspx` +
      `?tipo=D&prov=${encodeURIComponent(prov)}&mun=${encodeURIComponent(mun)}` +
      `&sigla=${encodeURIComponent(sigla)}&via=${encodeURIComponent(via)}&num=${num}`;

    const commonHeaders = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Accept": "text/html,application/xhtml+xml",
      "Accept-Language": "es-ES,es;q=0.9",
    };

    // Paso 1 — GET: cargar el formulario y extraer VIEWSTATE + EVENTVALIDATION
    const getRes = await fetch(url, {
      headers: { ...commonHeaders, "Referer": "https://www1.sedecatastro.gob.es/OVCInicio.aspx" },
      signal: AbortSignal.timeout(10000),
      redirect: "follow",
    });
    if (!getRes.ok) return { _err: `GET HTTP ${getRes.status}` };
    const getHtml = await getRes.text();

    const viewState    = getHtml.match(/name="__VIEWSTATE"[^>]*value="([^"]+)"/)?.[1] ??
                         getHtml.match(/id="__VIEWSTATE"[^>]*value="([^"]+)"/)?.[1] ?? "";
    const vsGen        = getHtml.match(/name="__VIEWSTATEGENERATOR"[^>]*value="([^"]+)"/)?.[1] ?? "";
    const evValidation = getHtml.match(/name="__EVENTVALIDATION"[^>]*value="([^"]+)"/)?.[1] ?? "";

    if (!viewState) return { _err: "no_viewstate" };

    // Cookie de sesión si la hay
    const cookieHeader = getRes.headers.get("set-cookie")
      ? { "Cookie": getRes.headers.get("set-cookie").split(";")[0] }
      : {};

    // Paso 2 — POST: enviar la búsqueda con el VIEWSTATE del formulario
    // __EVENTTARGET simula click en el botón de búsqueda (control típico de Catastro)
    const postBody = new URLSearchParams({
      "__EVENTTARGET":           "ctl00$Contenido$btnBuscar",
      "__EVENTARGUMENT":         "",
      "__VIEWSTATE":             viewState,
      "__VIEWSTATEGENERATOR":    vsGen,
      "__EVENTVALIDATION":       evValidation,
    });

    const postRes = await fetch(url, {
      method: "POST",
      headers: {
        ...commonHeaders,
        ...cookieHeader,
        "Content-Type": "application/x-www-form-urlencoded",
        "Referer": url,
      },
      body: postBody.toString(),
      signal: AbortSignal.timeout(10000),
      redirect: "follow",
    });
    if (!postRes.ok) return { _err: `POST HTTP ${postRes.status}` };
    const postHtml = await postRes.text();

    const result = parseListaBienesHtml(postHtml, postRes.url ?? url);
    if (!result || result._noParcel) {
      const bodyStart = postHtml.toLowerCase().indexOf("<body");
      const bodySnip  = bodyStart >= 0 ? postHtml.slice(bodyStart, bodyStart + 2500) : postHtml.slice(0, 2500);
      return { _err: result?._noParcel ? "sin_inmueble_dir" : "refCatastral no encontrada (post)", _html: bodySnip };
    }
    return result;
  } catch (e) { return { _err: e.message }; }
}

// Búsqueda por coordenadas — último recurso. Cuando encuentra la referencia,
// usa la misma sesión HTTP para obtener el detalle en OVCConCiud.
async function lookupCatastroWeb(lat, lon) {
  const WEB_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "text/html,application/xhtml+xml",
    "Accept-Language": "es-ES,es;q=0.9",
  };

  const tryPoint = async (la, lo) => {
    try {
      const { x, y } = wgs84ToWebMercator(la, lo);
      const listUrl = `https://www1.sedecatastro.gob.es/CYCBienInmueble/OVCListaBienes.aspx?origen=Carto&huso=3857&x=${x}&y=${y}`;
      const listRes = await fetch(listUrl, {
        headers: WEB_HEADERS,
        signal: AbortSignal.timeout(10000),
        redirect: "follow",
      });
      if (!listRes.ok) return { _err: `HTTP ${listRes.status}` };
      const listHtml = await listRes.text();

      const parsed = parseListaBienesHtml(listHtml, listRes.url ?? listUrl);
      if (!parsed?.refCatastral) return parsed;

      // Usar la cookie de sesión de OVCListaBienes para OVCConCiud
      const sessionCookie = listRes.headers.get("set-cookie")?.split(";")[0] ?? "";

      const parseDetail = (dHtml) => {
        const supSueloMatch =
          dHtml.match(/[Ss]up(?:erficie)?\s*(?:gr[aá]fica\s*)?(?:de\s*)?[Ss]uelo[^<]{0,80}?(\d[\d.,]+)\s*m[²2]/is) ||
          dHtml.match(/(\d[\d.,]+)\s*m[²2][^<]{0,80}?[Ss]uelo/is) ||
          dHtml.match(/id="[^"]*[Ss]uelo[^"]*"[^>]*>\s*(\d[\d.,]+)/i);
        const supConstMatch = dHtml.match(/[Ss]up(?:erficie)?\s*[Cc]onstrui[^<]{0,80}?(\d[\d.,]+)\s*m[²2]/is);
        const usoMatch = dHtml.match(/[Uu]so[^<]{0,50}<[^>]+>\s*([A-ZÁÉÍÓÚ][^<]{3,100})/);
        return {
          supSuelo: supSueloMatch?.[1]?.replace(",", ".") ?? null,
          supConst: supConstMatch?.[1]?.replace(",", ".") ?? null,
          uso:      usoMatch ? usoMatch[1].replace(/&[a-z]+;/gi, " ").trim() : null,
        };
      };

      const fetchDetail = async (ref) => {
        const url = `https://www1.sedecatastro.gob.es/CYCBienInmueble/OVCConCiud.aspx?RefC=${ref}`;
        const r = await fetch(url, {
          headers: { ...WEB_HEADERS, "Referer": listUrl, ...(sessionCookie ? { "Cookie": sessionCookie } : {}) },
          signal: AbortSignal.timeout(8000), redirect: "follow",
        });
        if (!r.ok) return null;
        const h = await r.text();
        if (h.includes("OVCErrorDatos")) return { _ovcError: true };
        return { html: h, ref };
      };

      try {
        let detail = await fetchDetail(parsed.refCatastral);
        // Si la referencia de unidad (20 chars) tiene expediente abierto, intentar con ref de parcela (14 chars)
        if (detail?._ovcError && parsed.refCatastral.length > 14) {
          detail = await fetchDetail(parsed.refCatastral.slice(0, 14));
        }
        if (detail?.html) {
          const d = parseDetail(detail.html);
          return { ...parsed, ...d, _detailRef: detail.ref };
        }
      } catch { /* continuar sin detalle */ }

      return parsed; // referencia encontrada, sin detalle
    } catch (e) { return { _err: e.message }; }
  };

  const d = 0.00018;
  const points = [
    [lat, lon], [lat + d, lon], [lat - d, lon],
    [lat, lon + d], [lat, lon - d],
  ];

  const results = await Promise.all(points.map(([la, lo]) => tryPoint(la, lo)));
  const success = results.find(r => r?.refCatastral);
  if (success) return success;

  const allNoParcel = results.every(r => r?._noParcel || r === null);
  return { _err: allNoParcel ? "sin_inmueble_en_area" : "refCatastral no encontrada", _pointsTriedCount: points.length };
}

// Geocodifica una dirección vía Google Geocoding API → {lat, lon, municipioOficial}
// Ventajas sobre Nominatim: coordenadas en la entrada del edificio (no en la calzada)
// y jerarquía administrativa correcta para España (level_4 = municipio catastral)
async function geocodeGoogle(addr) {
  const key = process.env.GEOCODING_API;
  if (!key) return null;
  try {
    const q = [addr.nombre_via, addr.numero, addr.municipio, "Canarias", "España"]
      .filter(Boolean).join(", ");
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(q)}&key=${key}&language=es&region=ES`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    const data = await res.json();
    if (data.status !== "OK" || !data.results?.length) return { _err: data.status };
    const result = data.results[0];
    const { lat, lng } = result.geometry.location;
    const comps = result.address_components ?? [];
    const get = (...types) => {
      for (const t of types) {
        const c = comps.find(c => c.types.includes(t));
        if (c) return c.long_name;
      }
      return null;
    };
    // En España la jerarquía varía por región — probar todos los niveles
    const municipioRaw = get(
      "administrative_area_level_4",
      "administrative_area_level_5",
      "administrative_area_level_3",
    );
    return {
      lat,
      lon: lng,
      municipioOficial: municipioRaw ? normCatastro(municipioRaw) : null,
      _components: comps.map(c => ({ name: c.long_name, types: c.types })), // debug
      _source: "google",
    };
  } catch (e) { return { _err: e.message }; }
}

// Fallback: Nominatim (OpenStreetMap) — usado si Google no está disponible
async function geocodeNominatim(addr) {
  try {
    const q = [addr.nombre_via, addr.numero, addr.municipio, "Canarias", "España"]
      .filter(Boolean).join(", ");
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=1&q=${encodeURIComponent(q)}`,
      { headers: { "User-Agent": "SKEMA/1.0 info@skema.es" }, signal: AbortSignal.timeout(6000) }
    );
    const data = await res.json();
    if (!Array.isArray(data) || !data.length) return null;
    const item = data[0];
    const a = item.address ?? {};
    const municipioOficial = a.city ?? a.town ?? a.municipality ?? null;
    return {
      lat: parseFloat(item.lat),
      lon: parseFloat(item.lon),
      municipioOficial: municipioOficial ? normCatastro(municipioOficial) : null,
      _source: "nominatim",
    };
  } catch { return null; }
}

// Geocodificación: Google primero (más preciso), Nominatim como fallback
async function geocodeAddress(addr) {
  const google = await geocodeGoogle(addr);
  if (google?.lat) return google;
  return geocodeNominatim(addr);
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

// Consulta Catastro por coordenadas WGS84 — prueba 5 puntos en paralelo para cubrir
// el caso en que Nominatim devuelva un punto en la calle (sin parcela) en vez de la parcela
async function lookupCatastroByCoords(lat, lon) {
  const d = 0.00014; // ~15m — suficiente para pasar de la acera a la parcela
  const points = [
    [lat,   lon  ],  // punto original
    [lat+d, lon  ],  // norte
    [lat-d, lon  ],  // sur
    [lat,   lon+d],  // este
    [lat,   lon-d],  // oeste
  ];

  const tryPoint = async (la, lo) => {
    try {
      const res = await fetch(
        `https://ovc.catastro.meh.es/OVCServWeb/OVCWcfLibres/REST/OVCCallejero.svc/Consulta_RCCOOR?SRS=EPSG:4258&Coordenada_X=${lo}&Coordenada_Y=${la}`,
        { signal: AbortSignal.timeout(8000) }
      );
      const xml = await res.text();
      const pc1 = xml.match(/<pc1>([^<]+)<\/pc1>/)?.[1]?.trim();
      const pc2 = xml.match(/<pc2>([^<]+)<\/pc2>/)?.[1]?.trim();
      if (!pc1) return null;
      const xcen = parseFloat(xml.match(/<xcen>([^<]+)<\/xcen>/)?.[1] ?? "NaN");
      const ycen = parseFloat(xml.match(/<ycen>([^<]+)<\/ycen>/)?.[1] ?? "NaN");
      const ldt  = xml.match(/<ldt>([^<]+)<\/ldt>/)?.[1]?.trim() ?? "";
      return { refCatastral: pc1+pc2, xcen: isNaN(xcen)?null:xcen, ycen: isNaN(ycen)?null:ycen, direccion: ldt };
    } catch { return null; }
  };

  const results = await Promise.all(points.map(([la, lo]) => tryPoint(la, lo)));
  return results.find(r => r?.refCatastral) ?? { _err: "sin_resultado" };
}

// Consulta detalle de parcela por referencia catastral (uso, superficie)
async function lookupCatastroDetalle(refCatastral) {
  try {
    const res = await fetch(
      `https://ovc.catastro.meh.es/OVCServWeb/OVCWcfLibres/REST/OVCCallejero.svc/Consulta_DNPPP?RC=${encodeURIComponent(refCatastral)}`,
      { signal: AbortSignal.timeout(6000) }
    );
    const xml = await res.text();
    const luso = xml.match(/<luso>([^<]+)<\/luso>/)?.[1]?.trim();
    const stl  = xml.match(/<stl>([^<]+)<\/stl>/)?.[1]?.trim();
    const sfc  = xml.match(/<sfc>([^<]+)<\/sfc>/)?.[1]?.trim();
    return luso ? { uso: luso, supSuelo: stl, supConst: sfc } : null;
  } catch { return null; }
}

// INSPIRE WFS del Catastro — API oficial para desarrolladores, distinto path al REST bloqueado
// Devuelve referencia catastral (14 chars) + m² suelo directamente en GML estructurado
async function lookupCatastroWFS(lat, lon) {
  try {
    const d = 0.00025; // ~27m a latitud 28°
    // EPSG:4326 en WFS 2.0 tiene orden lat,lon (no lon,lat) — error anterior causaba búsqueda en el Índico
    const bbox = `${(lat-d).toFixed(6)},${(lon-d).toFixed(6)},${(lat+d).toFixed(6)},${(lon+d).toFixed(6)},EPSG:4326`;
    const url = `https://ovc.catastro.meh.es/INSPIRE/wfsCP.aspx?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=CP:CadastralParcel&COUNT=3&SRSNAME=EPSG:4326&BBOX=${bbox}`;

    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return { _err: `HTTP ${res.status}` };
    const xml = await res.text();

    if (xml.includes("ExceptionReport") || xml.includes("ExceptionText")) {
      const msg = xml.match(/<[^:]*ExceptionText>([^<]+)</)?.[1] ?? "WFS exception";
      return { _err: msg };
    }

    // nationalCadastralReference = referencia de parcela (14 chars, sin código de unidad)
    const refMatch = xml.match(/<CP:nationalCadastralReference>([^<]+)<\/CP:nationalCadastralReference>/);
    if (!refMatch) return { _err: "sin_resultado_wfs" };
    const refCatastral = refMatch[1].trim();

    // areaValue = superficie suelo en m²
    const areaMatch = xml.match(/<CP:areaValue[^>]*>([^<]+)<\/CP:areaValue>/);
    const supSuelo = areaMatch ? String(Math.round(parseFloat(areaMatch[1]))) : null;

    return { refCatastral, supSuelo, _source: "wfs-inspire" };
  } catch (e) { return { _err: e.message }; }
}

// Detalle vía OVCConCiud.aspx — página de ficha individual
async function lookupCatastroDetalleWeb(refCatastral) {
  const WEB_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "text/html,application/xhtml+xml",
    "Accept-Language": "es-ES,es;q=0.9",
  };

  const parseAndCheck = (html, usedRef) => {
    if (html.includes("OVCErrorDatos")) return { _ovcError: true };
    const supSueloMatch =
      html.match(/[Ss]up(?:erficie)?\s*(?:gr[aá]fica\s*)?(?:de\s*)?[Ss]uelo[^<]{0,80}?(\d[\d.,]+)\s*m[²2]/is) ||
      html.match(/(\d[\d.,]+)\s*m[²2][^<]{0,80}?[Ss]uelo/is) ||
      html.match(/id="[^"]*[Ss]uelo[^"]*"[^>]*>\s*(\d[\d.,]+)/i);
    const supConstMatch =
      html.match(/[Ss]up(?:erficie)?\s*[Cc]onstrui[^<]{0,80}?(\d[\d.,]+)\s*m[²2]/is) ||
      html.match(/[Cc]onstrui[^<]{0,80}?(\d[\d.,]+)\s*m[²2]/is);
    const usoMatch = html.match(/[Uu]so[^<]{0,50}<[^>]+>\s*([A-ZÁÉÍÓÚ][^<]{3,100})/);
    const supSuelo = supSueloMatch?.[1]?.replace(",", ".") ?? null;
    const supConst = supConstMatch?.[1]?.replace(",", ".") ?? null;
    const uso = usoMatch ? usoMatch[1].replace(/&[a-z]+;/gi, " ").trim() : null;
    if (!supSuelo && !uso) return { _err: "sin_datos_en_OVCConCiud" };
    return { uso, supSuelo, supConst, _source: "catastro-web-detalle", _refUsed: usedRef };
  };

  const fetchRef = async (ref) => {
    const url = `https://www1.sedecatastro.gob.es/CYCBienInmueble/OVCConCiud.aspx?RefC=${encodeURIComponent(ref)}`;
    const res = await fetch(url, { headers: WEB_HEADERS, signal: AbortSignal.timeout(10000), redirect: "follow" });
    if (!res.ok) return null;
    return parseAndCheck(await res.text(), ref);
  };

  // OVCListaBienes?tipo=ref — búsqueda por referencia, distinto circuito que OVCConCiud,
  // funciona aunque el inmueble tenga expediente abierto en OVCConCiud
  const tryListaByRef = async (ref14) => {
    const rc1 = ref14.slice(0, 7);
    const rc2 = ref14.slice(7, 14);
    const url = `https://www1.sedecatastro.gob.es/CYCBienInmueble/OVCListaBienes.aspx?tipo=ref&rc1=${rc1}&rc2=${rc2}`;
    const res = await fetch(url, { headers: WEB_HEADERS, signal: AbortSignal.timeout(10000), redirect: "follow" });
    if (!res.ok) return { _err: `lista-ref HTTP ${res.status}`, _refUrl: url };
    const html = await res.text();
    // Intentar extraer m² y uso del HTML de resultados
    const supSueloMatch =
      html.match(/[Ss]up(?:erficie)?\s*(?:gr[aá]fica\s*)?(?:de\s*)?[Ss]uelo[^<]{0,80}?(\d[\d.,]+)\s*m[²2]/is) ||
      html.match(/(\d[\d.,]+)\s*m[²2][^<]{0,80}?[Ss]uelo/is) ||
      html.match(/id="[^"]*[Ss]uelo[^"]*"[^>]*>\s*(\d[\d.,]+)/i);
    const supConstMatch =
      html.match(/[Ss]up(?:erficie)?\s*[Cc]onstrui[^<]{0,80}?(\d[\d.,]+)\s*m[²2]/is) ||
      html.match(/[Cc]onstrui[^<]{0,80}?(\d[\d.,]+)\s*m[²2]/is);
    const usoMatch = html.match(/[Uu]so[^<]{0,50}<[^>]+>\s*([A-ZÁÉÍÓÚ][^<]{3,100})/);
    const supSuelo = supSueloMatch?.[1]?.replace(",", ".") ?? null;
    const supConst = supConstMatch?.[1]?.replace(",", ".") ?? null;
    const uso = usoMatch ? usoMatch[1].replace(/&[a-z]+;/gi, " ").trim() : null;
    return { uso, supSuelo, supConst, _source: "catastro-lista-ref", _refUrl: url };
  };

  try {
    const result = await fetchRef(refCatastral);
    if (result && !result._ovcError) return result;
    // Si la ref de unidad (20 chars) tiene expediente abierto, intentar con ref de parcela (14 chars)
    const ref14 = refCatastral.length > 14 ? refCatastral.slice(0, 14) : refCatastral;
    if (refCatastral.length > 14) {
      const retry = await fetchRef(ref14);
      if (retry && !retry._ovcError) return retry;
    }
    // Último recurso: OVCListaBienes?tipo=ref — distinto circuito, evita OVCErrorDatos
    return await tryListaByRef(ref14);
  } catch (e) { return { _err: e.message }; }
}

// Consulta edificaciones en el entorno inmediato vía Overpass (OpenStreetMap)
// Devuelve distribución de alturas reales de la misma calle/manzana
async function lookupOverpass(lat, lon, radius = 150) {
  try {
    const query = `[out:json][timeout:10];(way["building"](around:${radius},${lat},${lon});relation["building"]["type"="multipolygon"](around:${radius},${lat},${lon}););out tags;`;
    const res = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `data=${encodeURIComponent(query)}`,
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const elements = data.elements ?? [];

    const levelCount = {};
    for (const el of elements) {
      const raw = el.tags?.["building:levels"];
      if (!raw) continue;
      const n = parseInt(raw);
      if (isNaN(n) || n < 1) continue;
      levelCount[n] = (levelCount[n] ?? 0) + 1;
    }

    const entries = Object.entries(levelCount).sort((a, b) => Number(a[0]) - Number(b[0]));
    if (!entries.length) return null;

    // building:levels en OSM = total de plantas. 1=PB, 2=PB+1, 3=PB+2...
    const parts = entries.map(([lvl, cnt]) => {
      const n = Number(lvl);
      const label = n === 1 ? "PB" : `PB+${n - 1}`;
      return `${label} ×${cnt}`;
    });
    const dominant = entries.sort((a, b) => Number(b[1]) - Number(a[1]))[0];
    const domLabel = Number(dominant[0]) === 1 ? "PB" : `PB+${Number(dominant[0]) - 1}`;

    return {
      summary: parts.join("  ·  "),
      dominant: domLabel,
      total: entries.reduce((s, [, c]) => s + Number(c), 0),
    };
  } catch { return null; }
}

// Consulta planeamiento urbanístico vía GRAFCAN WMS GetFeatureInfo — toda Canarias
// Consulta WFS de IDECanarias (GRAFCAN) para obtener referencia catastral por coordenadas UTM
// Accesible desde Frankfurt — no usa ovc.catastro.meh.es
async function lookupGrafcanParcel(lat, lon) {
  try {
    const utm = wgs84ToUtm28N(lat, lon);
    const buf = 20;
    const bbox = `${utm.x - buf},${utm.y - buf},${utm.x + buf},${utm.y + buf},EPSG:32628`;
    const url = `https://idecan1.grafcan.es/ServicioWFS/DistribucionCP?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=CP:CadastralParcel&COUNT=3&SRSNAME=EPSG:32628&BBOX=${bbox}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "SKEMA/1.0 info@skema.es", "Accept": "application/xml,text/xml,*/*" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { _err: `HTTP ${res.status}` };
    const xml = await res.text();

    // Intentar extraer referencia catastral con varios nombres de campo posibles
    const refCatastral =
      xml.match(/<(?:CP:nationalCadastralReference|nationalCadastralReference)>([^<]{14,20})<\//)?.[1]?.trim() ??
      xml.match(/<(?:refe_catas|REFE_CATAS|REFCATP|REFERENCIA_CATASTRAL)>([A-Z0-9]{14,20})<\//i)?.[1]?.trim() ??
      xml.match(/\b(\d{7}[A-Z]{2}\d{4}[A-Z]\d{4}[A-Z]{2})\b/)?.[1] ??
      null;

    const areaMatch = xml.match(/<(?:CP:)?areaValue[^>]*>(\d[\d.]*)<\//);
    const supSuelo = areaMatch ? Math.round(parseFloat(areaMatch[1])).toString() : null;

    if (!refCatastral) return { _err: "sin_resultado_wfs_grafcan", _xml: xml.slice(0, 600) };
    return { refCatastral, supSuelo, _source: "grafcan-wfs" };
  } catch (e) { return { _err: e.message }; }
}

async function lookupGrafcan(xcen, ycen) {
  if (!xcen || !ycen) return null;

  const buf    = 25;
  const bbox   = `${xcen - buf},${ycen - buf},${xcen + buf},${ycen + buf}`;
  // Capas individuales — devuelven links a PDFs del PGOU, no la capa agregada
  const layers = "EDIF,ZON,CLA,UG,DES";
  const url    = `https://idecan1.grafcan.es/ServicioWMS/PlanosOrd?SERVICE=WMS&SRS=EPSG:32628&VERSION=1.1.1&REQUEST=GetFeatureInfo&STYLES=&X=128&Y=128&BBOX=${bbox}&WIDTH=256&HEIGHT=256&QUERY_LAYERS=${layers}&LAYERS=${layers}&INFO_FORMAT=text/html`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const html = await res.text();

    const clean = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "");

    // Extraer pares label → URL de PDF dividiendo por etiquetas de bloque
    const sections = clean.split(/<\/(?:tr|p|div|li|dd|td)[^>]*>/i);
    const pairs = [];
    const seen  = new Set();

    for (const sec of sections) {
      const m = sec.match(/href=["']([^"']*\.pdf[^"']*)["']/i);
      if (!m) continue;
      const pdfUrl = m[1];
      if (seen.has(pdfUrl)) continue;
      seen.add(pdfUrl);

      const label = sec
        .replace(/<[^>]+>/g, " ")
        .replace(/&[a-z]+;/g, " ")
        .replace(/\s+/g, " ")
        .replace(/\bPDF\b/gi, "")
        .trim().slice(0, 80);

      pairs.push(`${label || "Documento"}: ${pdfUrl}`);
    }

    if (pairs.length > 0) return { text: pairs.join("\n"), hasPdfs: true };

    // Fallback: texto plano (por si la respuesta no tiene PDFs)
    const text = clean
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/\s+/g, " ").trim();

    if (!text || text.length < 30) return null;
    return { text };
  } catch { return null; }
}

// ── Intent detection (structured tasks) ───────────────────────────────────────
function detectIntent(message) {
  if (
    /\b(plano|planta|croquis|esquema)\b/i.test(message) && (
      /\d+\s*[x×]\s*\d+|\d+\s*(m[²2]?|metro|cm)/i.test(message) ||
      /\b(genera|crea|haz|dibuja|actualiza|modifica|cambia|regenera|nuevo|siguiente|ahora|dormitorio|habitaci)\b/i.test(message)
    )
  ) return "floorplan";

  if (
    /\b(normativa|pgou?|ayuntamiento|urbanismo|edificaci|licencia|retranqueo|altura.*máxim|coeficiente|parcela|uso.*suelo|pgm|catálogo|edificabilidad|aprovechamiento|cuantas.*plantas|plantas.*construir|puedo.*construir|construir.*terreno|construir.*solar|suelo.*urban|suelo.*rural|catastro|referencia catastral|metros.*parcela|parcela.*metros|datos.*parcela|parcela.*datos|m[²2].*parcela|solar)\b/i.test(message) ||
    /\b\d{7}[A-Za-z]{2}\d{4}[A-Za-z]\d{4}[A-Za-z]{2}\b/.test(message)  // referencia catastral directa
  ) return "normativa";

  if (
    /\b(redacta|redactar|escribe|escribir|genera|generar|elabora|elaborar|prepara|preparar|crea|crear|haz|hacer|necesito|quiero)\b.{0,30}\b(informe|acta|contrato|memoria|certificado|presupuesto|oferta|propuesta|resumen|documento|escrito|carta|email|correo|nota\s+interior|minuta|requerimiento|notificacion|denuncia|solicitud|declaracion|dictamen|protocolo|manual|instruccion|procedimiento)\b/i.test(message) ||
    /\b(corrige|correg|mejora|revisa|reescribe|reformula|adapta|traduce)\b.{0,40}\b(texto|redacc|document|escrit|parrafo|carta|informe|contrato)\b/i.test(message) ||
    /\b(texto|documento|escrito)\b.{0,30}\b(profesional|formal|oficial|juridico|tecnico|administrativo)\b/i.test(message)
  ) return "document";

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

// ── Google Cloud Vision ────────────────────────────────────────────────────────
async function analyzeWithVision(base64) {
  const key = process.env.CLOUD_VISION_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requests: [{
            image: { content: base64 },
            features: [
              { type: "LABEL_DETECTION", maxResults: 10 },
              { type: "TEXT_DETECTION" },
            ],
          }],
        }),
        signal: AbortSignal.timeout(8000),
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const r = data.responses?.[0];
    if (!r) return null;
    const labels = (r.labelAnnotations ?? []).filter(l => l.score > 0.6);
    const ocrText = (r.textAnnotations?.[0]?.description ?? "").trim();
    return { labels, ocrText };
  } catch { return null; }
}

// Keywords that indicate the image needs Claude's full visual analysis (architectural / technical)
const TECHNICAL_VISUAL_KEYWORDS = [
  "plan", "blueprint", "floor plan", "map", "diagram", "aerial", "aerial view",
  "architectural", "architecture", "facade", "building", "construction", "urban",
  "satellite imagery", "neighbourhood", "city", "street", "road",
  "engineering", "technical drawing", "schematic",
];

function isTechnicalImage(labels) {
  const combined = labels.map(l => l.description.toLowerCase()).join(" ");
  return TECHNICAL_VISUAL_KEYWORDS.some(kw => combined.includes(kw));
}

// Returns true when the raw image should be sent to Claude (Sonnet does the visual work).
// Returns false when Vision context alone is enough (saves multimodal tokens).
function shouldSendImageToClaude(labels, ocrText) {
  // Technical content always goes to Claude with the image for quality
  if (isTechnicalImage(labels)) return true;
  // Rich OCR text on a non-technical image — Claude can work from the text
  if ((ocrText ?? "").length > 60) return false;
  // High-confidence top label on a general image (animal, food, object…) — Vision context is enough
  if (labels?.[0]?.score > 0.82) return false;
  // Uncertain — send image as fallback
  return true;
}

// ── File blocks builder — returns array of content blocks ─────────────────────
async function buildFileBlocks(name, mediaType, base64) {
  const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/jpg"];

  if (IMAGE_TYPES.includes(mediaType)) {
    const mt = mediaType === "image/jpg" ? "image/jpeg" : mediaType;
    const vision = await analyzeWithVision(base64);

    if (vision) {
      // Build Vision context string
      let visionCtx = "[Google Vision — Análisis de imagen]\n";
      if (vision.labels.length) {
        visionCtx += "Contenido: " +
          vision.labels.slice(0, 6).map(l => `${l.description} (${Math.round(l.score * 100)}%)`).join(", ");
      }
      if (vision.ocrText) {
        visionCtx += `\nTexto extraído:\n${vision.ocrText.slice(0, 2000)}`;
      }

      const blocks = [];
      if (shouldSendImageToClaude(vision.labels, vision.ocrText)) {
        blocks.push({ type: "image", source: { type: "base64", media_type: mt, data: base64 } });
      }
      blocks.push({ type: "text", text: visionCtx });
      return blocks;
    }

    // Fallback: Vision unavailable — send image directly to Claude
    return [{ type: "image", source: { type: "base64", media_type: mt, data: base64 } }];
  }

  if (mediaType === "application/pdf") {
    return [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } }];
  }
  if (mediaType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || name.toLowerCase().endsWith(".docx")) {
    try {
      const buf = Buffer.from(base64, "base64");
      const { value } = await mammoth.extractRawText({ buffer: buf });
      return [{ type: "text", text: `[Documento Word: "${name}"]\n\n${value.slice(0, 10000)}` }];
    } catch { return [{ type: "text", text: `[Documento Word: "${name}" — no se pudo extraer el texto]` }]; }
  }
  if (
    mediaType === "application/vnd.ms-excel" ||
    mediaType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    /\.xlsx?$/i.test(name)
  ) {
    try {
      const buf = Buffer.from(base64, "base64");
      const wb = XLSX.read(buf, { type: "buffer" });
      const text = wb.SheetNames.slice(0, 5).map(sn =>
        `=== ${sn} ===\n${XLSX.utils.sheet_to_csv(wb.Sheets[sn])}`
      ).join("\n\n").slice(0, 10000);
      return [{ type: "text", text: `[Hoja de cálculo: "${name}"]\n\n${text}` }];
    } catch { return [{ type: "text", text: `[Hoja de cálculo: "${name}" — no se pudo extraer el contenido]` }]; }
  }
  return [{ type: "text", text: `[Archivo adjunto: "${name}" — formato no compatible para lectura automática]` }];
}

// ── Handler ────────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { messages = [], projectInstructions, userInstructions, today, attachedFile, conversationId, userId, existingPlanId, forceDeep } = req.body;
  if (!messages.length) return res.status(400).json({ error: "Sin mensajes" });

  const userContext = userInstructions?.trim()
    ? `\n\nINSTRUCCIONES PERSONALES DEL USUARIO:\n${userInstructions.trim()}`
    : "";
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

  // Mantener el modo si la conversación ya empezó en un modo concreto
  const isFloorPlanConversation = messages.some(m => m.tool === "sketch" || m.tool === "floorplan");
  const isDocumentConversation  = messages.some(m => m.tool === "document");
  const isNormativaConversation = messages.some(m => m.tool === "normativa");
  let intent = isFloorPlanConversation ? "floorplan"
             : isDocumentConversation  ? "document"
             : isNormativaConversation ? "normativa"
             : detectIntent(lastUser.content);

  // Si ya había interacción de agenda Y el usuario da detalles (fecha/hora/título), mantener en agenda
  if (intent === "chat" && hasAgendaHistory) {
    const n2 = lastUser.content.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    const hasDateTime = /\b(manana|hoy|lunes|martes|miercoles|jueves|viernes|sabado|domingo|\d{1,2}\s+de|\d{1,2}:\d{2}|a\s+las?\s+\d)\b/.test(n2);
    const hasEventDetail = /\b(titulo|titulo:|fecha|fecha:|hora|hora:|reunion|cita|llamada|visita|evento|con\s+el|con\s+la|con\s+don|con\s+dona)\b/.test(n2);
    if (hasDateTime || hasEventDetail) intent = "agenda";
  }
  let history = messages.map(m => ({ role: m.role, content: m.content }));

  // If there's an attached file, enrich the last user message with a multimodal content block
  if (attachedFile?.base64) {
    let lastUserIdx = -1;
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].role === "user") { lastUserIdx = i; break; }
    }
    if (lastUserIdx !== -1) {
      const fileBlocks = await buildFileBlocks(attachedFile.name, attachedFile.mediaType, attachedFile.base64);
      const textContent = history[lastUserIdx].content?.trim();
      const allBlocks = [
        ...fileBlocks,
        { type: "text", text: textContent || "Analiza este archivo y describe su contenido." },
      ];
      history = [...history];
      history[lastUserIdx] = { role: "user", content: allBlocks };
    }
  }

  const _debug = { intent, msg: lastUser.content.slice(0, 60), hasFile: !!attachedFile };

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

    // ── Floorplan (LLM requirements → solver → SVG) ──
    if (intent === "floorplan") {
      const result = await runFloorPlanPipeline({
        messages: history,
        conversationId: conversationId ?? null,
        userId:         userId ?? null,
        existingPlanId: existingPlanId ?? null,
      });

      if (!result.ok) {
        return res.json({ content: result.ask, tool: "chat", model: MODELS.smart });
      }

      return res.json({
        content: result.notes,
        tool:    "floorplan",
        model:   MODELS.smart,
        svg:     result.svg,
        planId:  result.planId,
        version: result.version,
      });
    }

        // ── Normativa ──
    if (intent === "normativa") {
      // Detectar referencia catastral directa en el mensaje — case insensitive
      const refCatastralDirecta = (lastUser.content.match(/\b(\d{7}[A-Za-z]{2}\d{4}[A-Za-z]\d{4}[A-Za-z]{2})\b/)?.[1] ?? null)?.toUpperCase();

      // Check if message likely contains a street address (avoid extra Haiku call otherwise)
      const hasAddressHint = /\b(calle|avda?\.?|avenida|camino|carretera|plaza|c\/|nº|num|número|\bno\b\.?\s*\d|polígono|urb\.?|urbanización)\b|\d{1,4}[,\s]/i.test(lastUser.content);

      // DB lookup + address extraction run in parallel
      const [dbContext, addr] = await Promise.all([
        lookupNormativa(lastUser.content),
        hasAddressHint ? extractAddress(lastUser.content) : Promise.resolve({ tiene_direccion: false }),
      ]);

      // Catastro → SITCAN (sequential, each needs the previous result)
      let parcelBlock = "";
      const normDebug = { hasAddressHint, refCatastralDirecta, addr: addr.tiene_direccion ? addr : null };

      // Si el usuario escribió una referencia catastral directamente, buscarla en Catastro
      if (refCatastralDirecta && !addr.tiene_direccion) {
        // Intentar REST primero, fallback a scraping web
        let detalle = await lookupCatastroDetalle(refCatastralDirecta);
        if (!detalle) detalle = await lookupCatastroDetalleWeb(refCatastralDirecta);
        normDebug.detalleDirecto = detalle;
        if (detalle) {
          const fichaUrlDirecta = detalle._refUrl
            ?? `https://www1.sedecatastro.gob.es/CYCBienInmueble/OVCConCiud.aspx?RefC=${detalle._refUsed ?? refCatastralDirecta}`;
          parcelBlock = `[DATOS CATASTRALES OFICIALES — Sede Electrónica del Catastro]
Referencia catastral: ${refCatastralDirecta}${detalle.uso ? `\nUso catastral: ${detalle.uso}` : ""}${detalle.supSuelo ? `\nSuperficie suelo: ${detalle.supSuelo} m²` : ""}${detalle.supConst ? `\nSuperficie construida: ${detalle.supConst} m²` : ""}
Enlace ficha: ${fichaUrlDirecta}`;
        } else {
          parcelBlock = `[AVISO SISTEMA — SIN DATOS CATASTRALES]
No se pudo consultar Catastro para la referencia ${refCatastralDirecta}. REGLA: no inventes metros cuadrados, uso ni ningún dato de la parcela. Indica al usuario que no se pudo obtener el dato y ofrece el link: https://www1.sedecatastro.gob.es/CYCBienInmueble/OVCConCiud.aspx?RefC=${refCatastralDirecta}`;
        }
      }

      if (addr.tiene_direccion) {
        // REST + geocoding + web-por-dirección en paralelo (los 3 usan solo addr)
        const [parcel, nominatim, webByAddr] = await Promise.all([
          lookupCatastro(addr),
          geocodeAddress(addr),
          lookupCatastroWebByAddress(addr),
        ]);
        normDebug.catastro      = parcel;
        normDebug.nominatim     = nominatim;
        normDebug.catastroWebByAddr = webByAddr;

        // Prioridad: REST oficial > web por dirección (ambos usan la dirección exacta)
        let catastro = parcel?.refCatastral ? parcel : (webByAddr?.refCatastral ? webByAddr : null);

        // 0º: Reintentar REST con municipio oficial de Nominatim si difiere del extraído
        if (!catastro?.refCatastral && nominatim?.municipioOficial) {
          const munExtraido = normCatastro(addr.municipio ?? "");
          if (munExtraido !== nominatim.municipioOficial) {
            const addrFixed = { ...addr, municipio: nominatim.municipioOficial };
            const [parcelRetry, webByAddrRetry] = await Promise.all([
              lookupCatastro(addrFixed),
              lookupCatastroWebByAddress(addrFixed),
            ]);
            normDebug.catastroMunicipioFix = parcelRetry;
            normDebug.catastroWebByAddrRetry = webByAddrRetry;
            catastro = parcelRetry?.refCatastral ? parcelRetry : (webByAddrRetry?.refCatastral ? webByAddrRetry : catastro);
          }
        }

        if (!catastro?.refCatastral && nominatim) {
          // 1º: GRAFCAN WFS (IDECanarias) — accesible desde Frankfurt
          const grafcanParcel = await lookupGrafcanParcel(nominatim.lat, nominatim.lon);
          normDebug.grafcanParcel = grafcanParcel;
          if (grafcanParcel?.refCatastral) catastro = grafcanParcel;
        }

        if (!catastro?.refCatastral && nominatim) {
          // 2º: INSPIRE WFS oficial
          const wfs = await lookupCatastroWFS(nominatim.lat, nominatim.lon);
          normDebug.wfs = wfs;
          if (wfs?.refCatastral) catastro = wfs;
        }

        if (!catastro?.refCatastral && nominatim) {
          // 3º: REST Consulta_RCCOOR por coordenadas (multi-punto)
          const byCoords = await lookupCatastroByCoords(nominatim.lat, nominatim.lon);
          normDebug.catastroByCoords = byCoords;
          if (byCoords?.refCatastral) catastro = byCoords;
        }

        if (!catastro?.refCatastral && nominatim) {
          // 4º: scraping por coordenadas — último recurso, puede coger parcela vecina
          const webData = await lookupCatastroWeb(nominatim.lat, nominatim.lon);
          normDebug.catastroWeb = webData;
          if (webData?.refCatastral) catastro = webData;
        }

        // Coordenadas UTM: prioridad Catastro; fallback Nominatim → UTM
        let xcen = catastro?.xcen ?? null;
        let ycen = catastro?.ycen ?? null;
        if ((!xcen || !ycen) && nominatim) {
          const utm = wgs84ToUtm28N(nominatim.lat, nominatim.lon);
          xcen = utm.x;
          ycen = utm.y;
          normDebug.coordSource = "nominatim→utm";
        } else if (xcen && ycen) {
          normDebug.coordSource = catastro?._source ?? (catastro === parcel ? "catastro" : "catastro-por-coords");
        }

        if (catastro?.refCatastral) {
          // Tenemos referencia catastral — detalle + GRAFCAN + Overpass en paralelo
          // Si el WFS o el scraping ya trajeron supSuelo no necesitamos Consulta_DNPPP
          const alreadyHasSup = catastro.supSuelo != null;
          const [detalleRest, grafcan, entorno] = await Promise.all([
            alreadyHasSup ? Promise.resolve(null) : lookupCatastroDetalle(catastro.refCatastral),
            lookupGrafcan(xcen, ycen),
            nominatim ? lookupOverpass(nominatim.lat, nominatim.lon) : Promise.resolve(null),
          ]);
          // Si REST falló y no tenemos m², intentar scraping OVCConCiud
          let detalleWeb = null;
          if (!detalleRest && !alreadyHasSup) {
            detalleWeb = await lookupCatastroDetalleWeb(catastro.refCatastral);
          }
          const detalle = detalleRest ?? detalleWeb ?? (alreadyHasSup ? catastro : null);
          normDebug.detalle = detalle;
          normDebug.grafcan = grafcan;
          normDebug.entorno = entorno;

          {
          const uso       = detalle?.uso      ?? null;
          const supSuelo  = detalle?.supSuelo ?? null;
          const supConst  = detalle?.supConst ?? null;
          const direccion = catastro.direccion ?? null;
          // _refUrl tiene prioridad (lista por ref, funciona con expediente abierto)
          // _refUsed es el ref concreto que respondió en OVCConCiud
          const fichaUrl  = detalle?._refUrl
            ?? `https://www1.sedecatastro.gob.es/CYCBienInmueble/OVCConCiud.aspx?RefC=${detalle?._refUsed ?? catastro.refCatastral}`;

          parcelBlock = `[DATOS CATASTRALES OFICIALES — Sede Electrónica del Catastro]
Referencia catastral: ${catastro.refCatastral}${direccion ? `\nDirección registrada: ${direccion}` : ""}${uso ? `\nUso catastral: ${uso}` : ""}${supSuelo ? `\nSuperficie suelo: ${supSuelo} m²` : "\nSuperficie suelo: no disponible automáticamente"}${supConst ? `\nSuperficie construida: ${supConst} m²` : ""}
Enlace ficha: ${fichaUrl}${!supSuelo ? `\n\n[INSTRUCCIÓN SISTEMA] Los m² no están disponibles automáticamente. En la sección Parcela de tu respuesta, incluye esta frase exacta después del enlace: "Para afinar la estimación de plantas y edificabilidad, abre la ficha, busca la superficie del solar y dímela." Cuando el usuario la proporcione, úsala para calcular edificabilidad y plantas según las reglas de M² PROPORCIONADOS POR EL USUARIO.` : ""}`;

          if (grafcan) {
            parcelBlock += `\n\n[PLANEAMIENTO URBANÍSTICO — GRAFCAN / Gobierno de Canarias]\n${grafcan.text}`;
          }
          if (entorno) {
            parcelBlock += `\n\n[ENTORNO INMEDIATO — OpenStreetMap, radio 150m, misma calle/manzana]\nEdificaciones detectadas: ${entorno.summary}\nAltura predominante: ${entorno.dominant} (${entorno.total} edificios mapeados)\nReferencia para parcelas de superficie similar (~${supSuelo ?? "?"} m²): interpretar en función de tipología dominante en la trama.`;
          }
          } // cierre bloque datos catastrales

        } else {
          // Sin referencia catastral tras todos los intentos
          // Todavía podemos dar GRAFCAN + Overpass si tenemos coords de Nominatim
          const [grafcan, entorno] = await Promise.all([
            (xcen && ycen) ? lookupGrafcan(xcen, ycen) : Promise.resolve(null),
            nominatim ? lookupOverpass(nominatim.lat, nominatim.lon) : Promise.resolve(null),
          ]);
          normDebug.grafcan = grafcan;
          normDebug.entorno = entorno;

          // Bloquear alucinación: sin referencia, Claude no puede inventar m² ni datos de parcela
          parcelBlock = `[AVISO SISTEMA — SIN DATOS CATASTRALES]
No se pudo obtener referencia catastral ni metros cuadrados de Catastro para esta dirección.
REGLA CRÍTICA: NO inventes metros cuadrados, referencia catastral ni ningún dato físico de la parcela.
Indica al usuario que no se pudo consultar Catastro y ofrece este link para consulta manual:
https://www1.sedecatastro.gob.es/Cartografia/mapa.aspx?buscar=S`;

          if (grafcan) {
            parcelBlock += `\n\n[PLANEAMIENTO URBANÍSTICO — GRAFCAN / Gobierno de Canarias]\n${grafcan.text}`;
          }
          if (entorno) {
            parcelBlock += `\n\n[ENTORNO INMEDIATO — OpenStreetMap, radio 150m]\nEdificaciones detectadas: ${entorno.summary}\nAltura predominante: ${entorno.dominant} (${entorno.total} edificios mapeados)`;
          }
        }
      }

      const system = [
        dbContext ? `${NORMATIVA_SYSTEM}\n\n${dbContext}` : NORMATIVA_SYSTEM,
        parcelBlock ? `\n\n${parcelBlock}` : "",
        userContext,
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
        model: MODELS.smart, max_tokens: 6000,
        system: DOCUMENT_SYSTEM + userContext + projectContext, messages: history,
      });
      return res.json({ content: msg.content[0]?.text ?? "", tool: "document", model: MODELS.smart });
    }

    // ── General chat — router ──
    // If there's a file attached, always use Claude (Perplexity can't process files)
    const isInvestigar = !attachedFile && lastUser.content.startsWith("Busca información actualizada sobre ");
    const classification = attachedFile ? "NO" : forceDeep ? "DEEP" : await classifyQuery(lastUser.content, isInvestigar);

    if (classification !== "NO") {
      const content = await searchPerplexity(lastUser.content, classification);
      const tool    = classification === "DEEP" ? "research" : "search";
      return res.json({ content, tool, model: `perplexity-${classification.toLowerCase()}` });
    }

    // ── Claude chat ──
    // Files require the smart model (vision + document support)
    const model = attachedFile ? MODELS.smart : selectModel(lastUser.content);
    const msg   = await client.messages.create({
      model, max_tokens: 1500,
      system: SYSTEM + userContext + projectContext + agendaHistoryNote, messages: history,
    });
    return res.json({ content: msg.content[0]?.text ?? "", tool: "chat", model, _debug });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
