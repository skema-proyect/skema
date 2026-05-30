import { createClient } from "@supabase/supabase-js";
import { architectRequirements } from "./floorplan-llm.js";
import { solve } from "./floorplan-solver.js";
import { buildFloorPlanSVG } from "./floorplan-renderer.js";

const supabase = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  : null;

export async function runFloorPlanPipeline({ messages, conversationId, userId, existingPlanId }) {
  // 1. Cargar spec existente si se está editando
  let existingSpec = null;
  let parentId = null;
  let currentVersion = 0;

  if (existingPlanId && supabase) {
    const { data } = await supabase
      .from("floor_plans")
      .select("id, version, requirements")
      .eq("id", existingPlanId)
      .single();
    if (data) {
      // Solo aceptar specs en el nuevo formato (rooms[]). Specs del sistema viejo
      // (zona_publica/zona_privada/circulacion) se ignoran y la edición se trata
      // como creación nueva — el LLM no puede mezclar esquemas.
      const isNewFormat = Array.isArray(data.requirements?.rooms);
      if (isNewFormat) {
        existingSpec   = data.requirements;
        parentId       = data.id;
        currentVersion = data.version;
      }
    }
  }

  // 2. LLM arquitecto: interpreta el brief y decide la distribución
  const spec = await architectRequirements(messages, existingSpec);

  if (!spec.ok) {
    return { ok: false, ask: spec.ask };
  }

  // 3. Solver geométrico: convierte zonas a coordenadas
  const solverResult = solve(spec);

  if (solverResult.infeasible) {
    return { ok: false, ask: solverResult.infeasible };
  }

  const layout = solverResult.layout;

  // 4. Renderizar SVG
  const svg = buildFloorPlanSVG(layout);

  // 5. Guardar en Supabase
  let planId = null;
  const newVersion = currentVersion + 1;

  if (supabase && userId) {
    const { data, error } = await supabase
      .from("floor_plans")
      .insert({
        user_id:         userId,
        conversation_id: conversationId ?? "unknown",
        version:         newVersion,
        parent_id:       parentId,
        requirements:    spec,
        layout,
        svg,
        notes:           spec.notes ?? null,
      })
      .select("id")
      .single();

    if (!error && data) planId = data.id;
  }

  return {
    ok:      true,
    planId,
    version: newVersion,
    svg,
    notes:   spec.notes ?? "Aquí tienes el plano:",
  };
}
