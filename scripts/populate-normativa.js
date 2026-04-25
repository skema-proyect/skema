/**
 * populate-normativa.js
 *
 * Queries Perplexity sonar-pro for normativa urbanística of all 88 municipalities
 * of the Canary Islands and stores results in Supabase (normativa_canarias table).
 *
 * Env vars required:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, PERPLEXITY_API_KEY
 *
 * Optional env vars:
 *   TARGET_ISLA  — run only for one island (e.g. "Gran Canaria")
 *   RUN_MODE     — "full" (overwrite all) | "update" (skip existing, default)
 */

import { createClient } from "@supabase/supabase-js";

// ── Supabase ──────────────────────────────────────────────────────────────────
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ── Municipality list ─────────────────────────────────────────────────────────
const MUNICIPIOS = [
  // Gran Canaria (21)
  { isla: "Gran Canaria", municipio: "Las Palmas de Gran Canaria" },
  { isla: "Gran Canaria", municipio: "Telde" },
  { isla: "Gran Canaria", municipio: "Santa Lucía de Tirajana" },
  { isla: "Gran Canaria", municipio: "San Bartolomé de Tirajana" },
  { isla: "Gran Canaria", municipio: "Arucas" },
  { isla: "Gran Canaria", municipio: "Ingenio" },
  { isla: "Gran Canaria", municipio: "Agüimes" },
  { isla: "Gran Canaria", municipio: "Gáldar" },
  { isla: "Gran Canaria", municipio: "Mogan" },
  { isla: "Gran Canaria", municipio: "La Aldea de San Nicolás" },
  { isla: "Gran Canaria", municipio: "Tejeda" },
  { isla: "Gran Canaria", municipio: "Teror" },
  { isla: "Gran Canaria", municipio: "San Mateo (Vega de San Mateo)" },
  { isla: "Gran Canaria", municipio: "Santa Brígida" },
  { isla: "Gran Canaria", municipio: "Firgas" },
  { isla: "Gran Canaria", municipio: "Moya" },
  { isla: "Gran Canaria", municipio: "Valleseco" },
  { isla: "Gran Canaria", municipio: "Valsequillo" },
  { isla: "Gran Canaria", municipio: "Artenara" },
  { isla: "Gran Canaria", municipio: "Sta. María de Guía" },
  { isla: "Gran Canaria", municipio: "Agaete" },

  // Tenerife (31)
  { isla: "Tenerife", municipio: "Santa Cruz de Tenerife" },
  { isla: "Tenerife", municipio: "San Cristóbal de La Laguna" },
  { isla: "Tenerife", municipio: "Arona" },
  { isla: "Tenerife", municipio: "Adeje" },
  { isla: "Tenerife", municipio: "La Orotava" },
  { isla: "Tenerife", municipio: "Puerto de la Cruz" },
  { isla: "Tenerife", municipio: "Los Realejos" },
  { isla: "Tenerife", municipio: "San Miguel de Abona" },
  { isla: "Tenerife", municipio: "Granadilla de Abona" },
  { isla: "Tenerife", municipio: "Icod de los Vinos" },
  { isla: "Tenerife", municipio: "Guía de Isora" },
  { isla: "Tenerife", municipio: "Candelaria" },
  { isla: "Tenerife", municipio: "El Rosario" },
  { isla: "Tenerife", municipio: "Santiago del Teide" },
  { isla: "Tenerife", municipio: "Tacoronte" },
  { isla: "Tenerife", municipio: "La Victoria de Acentejo" },
  { isla: "Tenerife", municipio: "El Sauzal" },
  { isla: "Tenerife", municipio: "La Matanza de Acentejo" },
  { isla: "Tenerife", municipio: "Santa Úrsula" },
  { isla: "Tenerife", municipio: "El Tanque" },
  { isla: "Tenerife", municipio: "Los Silos" },
  { isla: "Tenerife", municipio: "Buenavista del Norte" },
  { isla: "Tenerife", municipio: "Garachico" },
  { isla: "Tenerife", municipio: "San Juan de la Rambla" },
  { isla: "Tenerife", municipio: "La Guancha" },
  { isla: "Tenerife", municipio: "Santa Cruz de Tenerife (Fasnia)" },
  { isla: "Tenerife", municipio: "Fasnia" },
  { isla: "Tenerife", municipio: "Arico" },
  { isla: "Tenerife", municipio: "Güímar" },
  { isla: "Tenerife", municipio: "Arafo" },
  { isla: "Tenerife", municipio: "Vilaflor" },

  // Lanzarote (7)
  { isla: "Lanzarote", municipio: "Arrecife" },
  { isla: "Lanzarote", municipio: "Tías" },
  { isla: "Lanzarote", municipio: "Yaiza" },
  { isla: "Lanzarote", municipio: "San Bartolomé" },
  { isla: "Lanzarote", municipio: "Tinajo" },
  { isla: "Lanzarote", municipio: "Haria" },
  { isla: "Lanzarote", municipio: "Teguise" },

  // Fuerteventura (8)
  { isla: "Fuerteventura", municipio: "Puerto del Rosario" },
  { isla: "Fuerteventura", municipio: "Pájara" },
  { isla: "Fuerteventura", municipio: "La Oliva" },
  { isla: "Fuerteventura", municipio: "Tuineje" },
  { isla: "Fuerteventura", municipio: "Antigua" },
  { isla: "Fuerteventura", municipio: "Betancuria" },
  { isla: "Fuerteventura", municipio: "Gran Tarajal (Tuineje)" },
  { isla: "Fuerteventura", municipio: "Las Palmas de Fuerteventura (Puerto del Rosario)" },

  // La Palma (14)
  { isla: "La Palma", municipio: "Santa Cruz de La Palma" },
  { isla: "La Palma", municipio: "Los Llanos de Aridane" },
  { isla: "La Palma", municipio: "El Paso" },
  { isla: "La Palma", municipio: "Breña Alta" },
  { isla: "La Palma", municipio: "Breña Baja" },
  { isla: "La Palma", municipio: "Villa de Mazo" },
  { isla: "La Palma", municipio: "Fuencaliente de La Palma" },
  { isla: "La Palma", municipio: "San Andrés y Sauces" },
  { isla: "La Palma", municipio: "Puntallana" },
  { isla: "La Palma", municipio: "Barlovento" },
  { isla: "La Palma", municipio: "Puntagorda" },
  { isla: "La Palma", municipio: "Garafía" },
  { isla: "La Palma", municipio: "Tijarafe" },
  { isla: "La Palma", municipio: "Tazacorte" },

  // La Gomera (6)
  { isla: "La Gomera", municipio: "San Sebastián de La Gomera" },
  { isla: "La Gomera", municipio: "Hermigua" },
  { isla: "La Gomera", municipio: "Agulo" },
  { isla: "La Gomera", municipio: "Vallehermoso" },
  { isla: "La Gomera", municipio: "Valle Gran Rey" },
  { isla: "La Gomera", municipio: "Alajeró" },

  // El Hierro (1)
  { isla: "El Hierro", municipio: "Valverde" },
];

// ── Document types to search per municipality ─────────────────────────────────
const TIPOS_DOCUMENTO = [
  "PGOU",            // Plan General de Ordenación Urbana
  "Ordenanzas",      // Ordenanzas municipales de edificación
  "Plan Especial",   // Planes Especiales
  "Plan Parcial",    // Planes Parciales
];

// ── Perplexity search ─────────────────────────────────────────────────────────
async function queryPerplexity(municipio, isla, tipoDocumento) {
  const query = `Normativa urbanística de ${municipio} (${isla}, Canarias): ${tipoDocumento}.
Dame: nombre oficial del documento, fecha de aprobación o publicación en BOC/BOCA, enlace de descarga oficial si existe, y estado actual (vigente/en revisión/derogado).
Fuentes preferidas: Ayuntamiento de ${municipio}, BOC (Boletín Oficial de Canarias), BOCA, sede electrónica municipal.`;

  const body = {
    model: "sonar-pro",
    messages: [
      {
        role: "system",
        content: `Eres un experto en normativa urbanística de Canarias. Responde en español con datos precisos y verificables.
Proporciona únicamente información confirmada. Si no encuentras el documento, responde con "No encontrado" y explica brevemente.
Formato de respuesta: JSON con campos: nombre_oficial, fecha_boc, url_descarga, estado, fuente, notas.`,
      },
      { role: "user", content: query },
    ],
    max_tokens: 800,
    search_context_size: "medium",
  };

  const res = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Perplexity error ${res.status}: ${err}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

// ── Parse Perplexity response ──────────────────────────────────────────────────
function parseResponse(text) {
  // Try to extract JSON block if present
  const jsonMatch = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/) ||
                    text.match(/(\{[\s\S]*?\})/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[1]);
    } catch { /* fall through to text parsing */ }
  }

  // Fallback: return raw text as notas
  return {
    nombre_oficial: null,
    fecha_boc: null,
    url_descarga: null,
    estado: null,
    fuente: "Perplexity sonar-pro",
    notas: text.slice(0, 1000),
  };
}

// ── Check if record already exists ────────────────────────────────────────────
async function recordExists(municipio, tipoDocumento) {
  const { data, error } = await supabase
    .from("normativa_canarias")
    .select("id")
    .eq("municipio", municipio)
    .eq("tipo_documento", tipoDocumento)
    .limit(1);

  if (error) throw error;
  return data && data.length > 0;
}

// ── Upsert record ──────────────────────────────────────────────────────────────
async function upsertRecord(isla, municipio, tipoDocumento, parsed) {
  const record = {
    isla,
    municipio,
    tipo_documento: tipoDocumento,
    nombre_oficial: parsed.nombre_oficial ?? null,
    fecha_boc: parsed.fecha_boc ?? null,
    url_descarga: parsed.url_descarga ?? null,
    fuente: parsed.fuente ?? "Perplexity sonar-pro",
    es_texto_refundido: false,
    verificado: false,
    notas: parsed.notas ?? null,
    updated_at: new Date().toISOString(),
  };

  // Check if record exists, then update or insert
  const { data: existing } = await supabase
    .from("normativa_canarias")
    .select("id")
    .eq("municipio", municipio)
    .eq("tipo_documento", tipoDocumento)
    .limit(1);

  if (existing && existing.length > 0) {
    const { error } = await supabase
      .from("normativa_canarias")
      .update(record)
      .eq("id", existing[0].id);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from("normativa_canarias")
      .insert(record);
    if (error) throw error;
  }
}

// ── Sleep helper ──────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const targetIsla = process.env.TARGET_ISLA?.trim() || null;
  const runMode    = process.env.RUN_MODE === "full" ? "full" : "update";

  console.log(`\n=== SKEMA Normativa Population ===`);
  console.log(`Mode:         ${runMode}`);
  console.log(`Target isla:  ${targetIsla || "todas"}`);
  console.log(`Date:         ${new Date().toISOString()}\n`);

  const municipios = targetIsla
    ? MUNICIPIOS.filter((m) => m.isla === targetIsla)
    : MUNICIPIOS;

  if (municipios.length === 0) {
    console.error(`No municipalities found for isla: ${targetIsla}`);
    process.exit(1);
  }

  let total = 0, skipped = 0, saved = 0, errors = 0;

  for (const { isla, municipio } of municipios) {
    for (const tipo of TIPOS_DOCUMENTO) {
      total++;
      const label = `${municipio} / ${tipo}`;

      // Skip existing records in "update" mode
      if (runMode === "update") {
        try {
          const exists = await recordExists(municipio, tipo);
          if (exists) {
            console.log(`  SKIP  ${label}`);
            skipped++;
            continue;
          }
        } catch (e) {
          console.error(`  ERR   ${label} — check failed: ${e.message}`);
          errors++;
          continue;
        }
      }

      // Query Perplexity
      try {
        console.log(`  FETCH ${label}`);
        const rawText = await queryPerplexity(municipio, isla, tipo);
        const parsed  = parseResponse(rawText);
        await upsertRecord(isla, municipio, tipo, parsed);
        console.log(`  SAVED ${label}${parsed.nombre_oficial ? ` → ${parsed.nombre_oficial}` : ""}`);
        saved++;
      } catch (e) {
        console.error(`  ERR   ${label} — ${e.message}`);
        errors++;
      }

      // Rate limit: ~2 req/s max for sonar-pro
      await sleep(600);
    }

    // Extra pause between municipalities
    await sleep(400);
  }

  console.log(`\n=== Done ===`);
  console.log(`Total:    ${total}`);
  console.log(`Saved:    ${saved}`);
  console.log(`Skipped:  ${skipped}`);
  console.log(`Errors:   ${errors}`);

  if (errors > 0) process.exit(1);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
