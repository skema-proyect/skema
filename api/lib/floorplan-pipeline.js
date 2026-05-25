import { createClient } from "@supabase/supabase-js";
import { extractRequirements } from "./floorplan-llm.js";
import { solve, applyDiff } from "./floorplan-solver.js";
import { buildFloorPlanSVG } from "./floorplan-renderer.js";

const supabase = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  : null;

export async function runFloorPlanPipeline({ messages, conversationId, userId, existingPlanId }) {
  // 1. Cargar requirements del plano existente si estamos editando
  let existingRequirements = null;
  let parentId = null;
  let currentVersion = 0;

  if (existingPlanId && supabase) {
    const { data } = await supabase
      .from("floor_plans")
      .select("id, version, requirements")
      .eq("id", existingPlanId)
      .single();
    if (data) {
      existingRequirements = data.requirements;
      parentId = data.id;
      currentVersion = data.version;
    }
  }

  // 2. Extraer requisitos desde el LLM
  // Solo los últimos 6 mensajes para no contaminar el contexto
  const recentMessages = messages.slice(-6).map(m => ({
    role: m.role,
    content: typeof m.content === "string" ? m.content : "[archivo adjunto]",
  }));

  const req = await extractRequirements(recentMessages, existingRequirements);

  if (!req.ok) {
    return { ok: false, ask: req.ask };
  }

  // 3. Resolver requirements finales
  let finalReq;
  if (req.mode === "edit" && existingRequirements) {
    finalReq = applyDiff(existingRequirements, req.diff ?? []);
    // Preservar notes del diff si existen
    if (req.notes) finalReq._notes = req.notes;
  } else {
    finalReq = req;
  }

  // 4. Ejecutar solver geométrico
  const solverResult = solve(finalReq);

  if (solverResult.infeasible) {
    return { ok: false, ask: solverResult.infeasible };
  }

  const layout = solverResult.layout;

  // 5. Renderizar SVG
  const svg = buildFloorPlanSVG(layout);

  // 6. Guardar en Supabase
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
        requirements:    finalReq,
        layout,
        svg,
        notes:           req.notes ?? null,
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
    notes:   req.notes ?? finalReq._notes ?? "Aquí tienes el plano:",
  };
}
