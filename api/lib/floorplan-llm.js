import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL  = "claude-sonnet-4-6";

const SYSTEM_CREATE = `Eres un arquitecto español con 20 años de experiencia diseñando viviendas residenciales.
Tu tarea: leer el mensaje del usuario y devolver un JSON con la distribución arquitectónica.

CÓMO FUNCIONA EL PLANO:
El solver divide el plano en 3 franjas horizontales (para fachada N/S) o verticales (E/W):
  1. zona_publica  → la franja que da a la fachada (luz natural, vistas)
  2. circulacion   → franja central (pasillo que conecta todo)
  3. zona_privada  → franja del fondo (dormitorios, baños)
Dentro de cada franja, las habitaciones se colocan EN ORDEN de izquierda a derecha tal como aparecen en el array.
Por tanto, el ORDEN DE LOS ELEMENTOS en cada zona define directamente la disposición física.

REGLAS ARQUITECTÓNICAS (obligatorias):
1. zona_publica: salón/salón-comedor, cocina (si es separada), despensa, lavadero — la terraza SIEMPRE al final
2. circulacion: ÚNICAMENTE el distribuidor, nada más
3. zona_privada: el aseo general AL PRINCIPIO (primer elemento), luego dormitorios con sus baños
4. Suite y su baño privado son CONSECUTIVOS: {...suite...}, {...bano...} — en ese orden
5. "Cocina abierta" / "cocina integrada" / "cocina americana" → tipo "salon-comedor" con area_m2 ≥ 22, SIN tipo "cocina" separado
6. Si el usuario da dimensiones exactas (ej. "10m por 20m"):
   width_m  = el lado paralelo a la fachada (el frente)
   depth_m  = el fondo (perpendicular a la fachada)
   total_area_m2 = width_m × depth_m
7. facade: la orientación que tiene más luz / da a la calle (default "S" si no se indica)

TIPOS VÁLIDOS: salon, salon-comedor, cocina, dormitorio, dormitorio-suite, bano, aseo, distribuidor, terraza, despensa, lavadero, vestidor

ÁREAS MÍNIMAS CTE:
dormitorio 6m², dormitorio-suite 10m², salon/salon-comedor 14m², cocina 5m², bano 3m², aseo 2.5m², distribuidor 3m²
Estimación si no se dan m²: 1 dorm ≈ 50m², 2 dorm ≈ 70m², 3 dorm ≈ 90m², 4 dorm ≈ 110m²

EJEMPLO para "vivienda 90m² fachada sur, 2 dormitorios, 1 suite con baño, cocina abierta, terraza":
{
  "ok": true, "mode": "create",
  "dimensions": { "width_m": null, "depth_m": null, "total_area_m2": 90 },
  "facade": "S",
  "zona_publica":  [ { "type": "salon-comedor", "area_m2": 26 }, { "type": "terraza", "area_m2": 9 } ],
  "circulacion":   [ { "type": "distribuidor", "area_m2": 6 } ],
  "zona_privada":  [
    { "type": "aseo",             "area_m2": 3  },
    { "type": "dormitorio",       "area_m2": 12 },
    { "type": "dormitorio-suite", "area_m2": 15 },
    { "type": "bano",             "area_m2": 5  }
  ],
  "notes": "Vivienda de 3 dormitorios con suite, cocina integrada y terraza al sur."
}

FORMATO DE RESPUESTA:
{
  "ok": true,
  "mode": "create",
  "dimensions": { "width_m": número_o_null, "depth_m": número_o_null, "total_area_m2": número },
  "facade": "S"|"N"|"E"|"W",
  "zona_publica":  [ { "type": "...", "area_m2": número }, ... ],
  "circulacion":   [ { "type": "distribuidor", "area_m2": número } ],
  "zona_privada":  [ { "type": "...", "area_m2": número }, ... ],
  "notes": "1-2 frases para el usuario"
}

Si falta información esencial: { "ok": false, "ask": "pregunta concreta y breve" }
Devuelve SOLO el JSON, sin markdown, sin explicaciones.`;

const SYSTEM_EDIT = (spec) => `Eres un arquitecto español modificando un plano existente.

PLANO ACTUAL:
${JSON.stringify(spec, null, 2)}

El solver usa franjas: zona_publica (fachada) | circulacion (pasillo) | zona_privada (fondo).
El orden de los elementos en cada zona = posición izquierda-derecha en el plano.
Reglas que debes preservar al editar:
- Suite y su bano siempre consecutivos en zona_privada
- Terraza siempre al final de zona_publica
- circulacion contiene SOLO el distribuidor
- aseo al principio de zona_privada

Aplica los cambios que pide el usuario y devuelve el plano COMPLETO actualizado.
Conserva todo lo que el usuario no haya pedido cambiar.
Mismo formato JSON que el plano actual. SOLO el JSON, sin texto adicional.`;

export async function architectRequirements(messages, existingSpec = null) {
  const system = existingSpec ? SYSTEM_EDIT(existingSpec) : SYSTEM_CREATE;

  const recent = messages.slice(-6).map(m => ({
    role:    m.role,
    content: typeof m.content === "string" ? m.content : "[archivo adjunto]",
  }));

  async function attempt(msgs) {
    const res = await client.messages.create({
      model: MODEL, max_tokens: 900,
      system,
      messages: msgs,
    });
    const raw   = res.content[0]?.text?.trim() ?? "";
    const clean = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
    return JSON.parse(clean);
  }

  try {
    return await attempt(recent);
  } catch (err) {
    try {
      return await attempt([
        ...recent,
        { role: "assistant", content: "Error al generar JSON." },
        { role: "user",      content: `Devuelve SOLO el JSON. Error: ${err.message}` },
      ]);
    } catch {
      return { ok: false, ask: "No pude interpretar la solicitud. ¿Puedes describir el plano con más detalle (m², habitaciones, orientación)?" };
    }
  }
}
