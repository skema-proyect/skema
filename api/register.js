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
  const sbUrl = process.env.SUPABASE_URL;
  const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const fetchUrl = `${sbUrl}/rest/v1/invite_codes?code=eq.${encodeURIComponent(normalizedCode)}&select=id,used&limit=1`;

  let invite = null;
  let fetchError = null;
  try {
    const r = await fetch(fetchUrl, {
      headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` }
    });
    const rows = await r.json();
    if (Array.isArray(rows) && rows.length > 0) invite = rows[0];
    else fetchError = JSON.stringify(rows);
  } catch (e) {
    fetchError = e.message;
  }

  if (!invite) {
    return res.status(400).json({
      error: "Código de acceso inválido",
      _debug: { code: normalizedCode, fetchError, urlPrefix: sbUrl?.slice(0, 40) }
    });
  }
  if (invite.used === true) {
    return res.status(400).json({ error: "Este código ya fue utilizado" });
  }

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
