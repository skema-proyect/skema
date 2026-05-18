import { createClient } from "@supabase/supabase-js";

const adminClient = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { email, password, name, code } = req.body ?? {};

  if (!email || !password || !code) {
    return res.status(400).json({ error: "Faltan campos obligatorios" });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: "La contraseña debe tener al menos 6 caracteres" });
  }

  const normalizedCode = code.trim().toUpperCase();

  // Validar código de acceso via fetch directo (bypass JS client)
  const sbUrl = process.env.SUPABASE_URL?.trimEnd().replace(/\/$/, "");
  const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const headers = { apikey: sbKey, Authorization: `Bearer ${sbKey}` };

  // Test 1: tabla sin filtros
  let test1 = null;
  try {
    const r = await fetch(`${sbUrl}/rest/v1/invite_codes?select=id&limit=1`, { headers });
    test1 = { status: r.status, body: await r.text() };
  } catch (e) { test1 = { err: e.message }; }

  // Test 2: con filtro de código
  let test2 = null;
  try {
    const r = await fetch(`${sbUrl}/rest/v1/invite_codes?select=id,used&code=eq.${encodeURIComponent(normalizedCode)}&limit=1`, { headers });
    test2 = { status: r.status, body: await r.text() };
  } catch (e) { test2 = { err: e.message }; }

  return res.status(400).json({
    error: "DEBUG",
    _debug: { url: sbUrl, test1, test2 }
  });

  // Crear usuario
  const { data: userData, error: userErr } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name: name?.trim() ?? "" },
  });

  if (userErr) {
    const msg = userErr.message.includes("already registered")
      ? "Este email ya está registrado"
      : userErr.message;
    return res.status(400).json({ error: msg });
  }

  // Marcar código como usado
  await adminClient
    .from("invite_codes")
    .update({ used: true, used_at: new Date().toISOString(), used_by: userData.user.id })
    .eq("id", invite.id);

  return res.json({ success: true });
}
