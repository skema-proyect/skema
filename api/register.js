import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;

// Anon client — para leer códigos (respeta RLS + política SELECT pública)
const anonClient = createClient(
  supabaseUrl,
  process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY
);

// Admin client — para crear usuarios y marcar código como usado
const adminClient = createClient(
  supabaseUrl,
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

  // Validar código de acceso
  const { data: invite, error: inviteErr } = await anonClient
    .from("invite_codes")
    .select("id, used")
    .eq("code", normalizedCode)
    .maybeSingle();

  if (inviteErr || !invite) {
    return res.status(400).json({ error: "Código de acceso inválido" });
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
