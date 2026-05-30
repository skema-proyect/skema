import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL  = "claude-sonnet-4-6";

// El LLM SOLO emite requisitos semánticos.
// No clasifica zonas, no ordena habitaciones, no asigna posiciones.
// El solver geométrico se encarga de toda la geometría.

const SYSTEM_CREATE = `Eres arquitecto. Tu única tarea: leer la solicitud del usuario y emitir un JSON con la lista de habitaciones a incluir en una vivienda.

NO decides posiciones, NO ordenas habitaciones, NO clasificas zonas. Eso lo hace otro sistema. Tú solo decides QUÉ habitaciones hay, sus áreas mínimas, y restricciones específicas.

TIPOS VÁLIDOS:
- salon, salon-comedor, comedor, cocina, terraza, despensa, lavadero
- distribuidor, aseo
- dormitorio, dormitorio-suite, bano, vestidor

ÁREAS MÍNIMAS RECOMENDADAS (m²):
salon 14 · salon-comedor 18 · comedor 8 · cocina 5 · terraza 5 · despensa 2 · lavadero 2
distribuidor 4 · aseo 2.5
dormitorio 8 (simple 6, doble 10) · dormitorio-suite 12 · bano 4 · vestidor 3

REGLAS DE COMPOSICIÓN (obligatorias):
1. Si hay más de una habitación privada (dormitorio o baño), DEBE haber un distribuidor.
2. "Cocina abierta" / "cocina integrada" / "cocina americana" → emite UN salon-comedor con área ≥22, SIN cocina aparte.
3. "Cocina cerrada" o el usuario no especifica → cocina como tipo separado.
4. dormitorio-suite implica baño asociado: incluye un bano con adjacent_to: ["dormitorio-suite"].
5. Si solo dice "salón", úsalo salon. Si dice "salón-comedor" o "salón con comedor", úsalo salon-comedor.

ESTIMACIÓN si el usuario no da m²:
1 dorm ≈ 55m² · 2 dorm ≈ 75m² · 3 dorm ≈ 90m² · 4 dorm ≈ 115m²

FACHADAS:
- "facades" lista las orientaciones que dan a calle/jardín (NO medianeras).
- Default: ["S"] si no se especifica.
- "Vivienda exterior" o "de esquina" → 2 fachadas, ej. ["S", "E"].
- "Pasante" → 2 fachadas opuestas, ej. ["S", "N"].

DIMENSIONES EXPLÍCITAS:
- Si el usuario dice "10 × 8" o "10m por 8m" → incluye dimensions: { width_m: 10, depth_m: 8 }.
- width_m es paralelo a la fachada (frente).
- depth_m es perpendicular (fondo).
- En ese caso, total_area_m2 = width_m × depth_m.

ORIENTACIÓN POR HABITACIÓN:
- Solo si el usuario lo pide para una habitación concreta. Ej. "salón al sur" → salon con orientation: "S".
- Si no, omitir el campo.

ADJACENT_TO:
- Solo cuando hay relación semántica fuerte. Ej. bano de suite → adjacent_to: ["dormitorio-suite"]. cocina + despensa → despensa adjacent_to: ["cocina"].

FORMATO DE RESPUESTA:
{
  "ok": true,
  "mode": "create",
  "total_area_m2": 90,
  "dimensions": null,
  "facades": ["S"],
  "rooms": [
    { "type": "salon-comedor", "min_area": 22 },
    { "type": "cocina", "min_area": 7 },
    { "type": "dormitorio-suite", "min_area": 13 },
    { "type": "bano", "min_area": 4, "adjacent_to": ["dormitorio-suite"] },
    { "type": "dormitorio", "min_area": 10 },
    { "type": "dormitorio", "min_area": 9 },
    { "type": "aseo", "min_area": 3 },
    { "type": "distribuidor", "min_area": 5 }
  ],
  "notes": "Vivienda de 90m² con 3 dormitorios (uno en suite), cocina cerrada y aseo de invitados al sur."
}

Si falta información esencial (no hay m² ni número de dormitorios):
{ "ok": false, "ask": "pregunta breve y concreta" }

Devuelve SOLO el JSON, sin markdown, sin texto adicional.`;

const SYSTEM_EDIT = (spec) => `Eres arquitecto modificando un plano existente.

PLANO ACTUAL (requisitos):
${JSON.stringify(spec, null, 2)}

Aplica los cambios que pide el usuario. Devuelve el JSON COMPLETO actualizado con el mismo formato.
Conserva idéntico todo lo que el usuario NO haya pedido cambiar (áreas, tipos, orientación, adjacent_to).

REGLAS:
- Si el usuario añade una habitación, añádela al array rooms con su tipo y min_area.
- Si la quita, elimínala.
- Si la redimensiona, cambia su min_area.
- Si pide más m² totales, ajusta total_area_m2 (y proporcionalmente las áreas si el usuario no dice cuáles).
- Si pide cambiar fachada, actualiza facades.
- Mantén la coherencia: si hay > 1 privada, sigue habiendo distribuidor; suite sigue con su bano adjacent_to.

Devuelve SOLO el JSON. Mismo schema. Sin markdown.`;

function validateSpec(spec) {
  if (!spec || typeof spec !== "object") return "no es objeto";
  if (spec.ok === false) return null; // ask, no validar más
  if (spec.ok !== true) return "falta ok:true";
  if (!Array.isArray(spec.rooms) || spec.rooms.length === 0) return "rooms vacío";
  if (typeof spec.total_area_m2 !== "number" || spec.total_area_m2 <= 0) return "total_area_m2 inválido";
  if (!Array.isArray(spec.facades) || spec.facades.length === 0) return "facades vacío";
  for (const r of spec.rooms) {
    if (!r.type || typeof r.type !== "string") return "room sin type";
    if (typeof r.min_area !== "number" || r.min_area <= 0) return `${r.type} sin min_area`;
  }
  return null;
}

export async function architectRequirements(messages, existingSpec = null) {
  const system = existingSpec ? SYSTEM_EDIT(existingSpec) : SYSTEM_CREATE;

  const recent = messages.slice(-6).map(m => ({
    role:    m.role,
    content: typeof m.content === "string" ? m.content : "[archivo adjunto]",
  }));

  async function attempt(msgs) {
    const res = await client.messages.create({
      model: MODEL, max_tokens: 1200,
      system,
      messages: msgs,
    });
    const raw   = res.content[0]?.text?.trim() ?? "";
    const clean = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
    const parsed = JSON.parse(clean);
    const err = validateSpec(parsed);
    if (err) throw new Error(`spec inválido: ${err}`);
    return parsed;
  }

  try {
    return await attempt(recent);
  } catch (err) {
    try {
      return await attempt([
        ...recent,
        { role: "assistant", content: "Error generando JSON." },
        { role: "user",      content: `Devuelve SOLO el JSON con el schema indicado. Error previo: ${err.message}` },
      ]);
    } catch {
      return { ok: false, ask: "No pude interpretar la solicitud. ¿Puedes decirme cuántos dormitorios y, si lo sabes, los metros cuadrados de la vivienda?" };
    }
  }
}
