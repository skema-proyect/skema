import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const DOC_PROMPTS = {
  informe: `Eres el asistente ejecutivo de un Director Administrativo de un estudio de arquitectura e ingeniería en Gran Canaria.
Redacta un INFORME DE VISITA DE OBRA profesional y estructurado a partir de la transcripción de voz proporcionada.

Estructura obligatoria:
1. DATOS DE LA VISITA (fecha, obra, asistentes — infiere lo que puedas)
2. ESTADO ACTUAL DE LA OBRA
3. INCIDENCIAS Y PROBLEMAS DETECTADOS
4. DECISIONES TOMADAS
5. COMPROMISOS Y PRÓXIMOS PASOS (con responsable y plazo si se menciona)
6. OBSERVACIONES

Tono: profesional, directo, ejecutivo. Usa bullet points donde sea eficiente.`,

  acta: `Eres el asistente ejecutivo de un Director Administrativo de un estudio de arquitectura e ingeniería.
Redacta un ACTA DE REUNIÓN formal y estructurada a partir de la transcripción de voz.

Estructura obligatoria:
1. DATOS DE LA REUNIÓN (fecha, lugar, asistentes — infiere lo que puedas)
2. ORDEN DEL DÍA
3. DESARROLLO DE LA REUNIÓN (punto por punto)
4. ACUERDOS ADOPTADOS
5. TAREAS Y RESPONSABLES
6. PRÓXIMA REUNIÓN (si se menciona)

Tono: formal, preciso, sin ambigüedades.`,

  nota: `Eres el asistente ejecutivo de un Director Administrativo de un estudio de arquitectura e ingeniería.
Redacta una NOTA INTERNA clara y estructurada a partir de la transcripción de voz.
Extrae las ideas principales, organízalas con lógica y elimina las muletillas del lenguaje hablado.
Tono: directo, profesional, conciso.`,

  resumen: `Eres el asistente ejecutivo de un Director Administrativo de un estudio de arquitectura e ingeniería.
Redacta un RESUMEN EJECUTIVO a partir de la transcripción de voz.
Destaca: decisiones clave, riesgos identificados, acciones requeridas y plazos.
Máximo 1 página. Tono: ejecutivo, sin relleno.`,
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { transcript, docType = "nota" } = req.body;
  if (!transcript) return res.status(400).json({ error: "Sin transcripción" });

  const systemPrompt = DOC_PROMPTS[docType] ?? DOC_PROMPTS.nota;

  try {
    const message = await client.messages.create({
      model:      "claude-sonnet-4-6",
      max_tokens: 2048,
      system:     systemPrompt,
      messages: [
        {
          role:    "user",
          content: `TRANSCRIPCIÓN:\n\n${transcript}\n\nRedacta el documento ahora.`,
        },
      ],
    });

    const content = message.content[0]?.text ?? "";
    res.json({ content });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
