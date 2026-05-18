import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
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

  // Validate invite code
  const { data: invite, error: inviteErr } = await supabase
    .from("invite_codes")
    .select("id, used")
    .eq("code", code.trim().toUpperCase())
    .single();

  if (inviteErr || !invite) {
    return res.status(400).json({ error: "Código de acceso inválido" });
  }
  if (invite.used) {
    return res.status(400).json({ error: "Este código ya ha sido utilizado" });
  }

  // Create user via admin API (bypasses "disable signups" setting)
  const { data: userData, error: userErr } = await supabase.auth.admin.createUser({
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

  // Mark code as used
  await supabase
    .from("invite_codes")
    .update({ used: true, used_at: new Date().toISOString(), used_by: userData.user.id })
    .eq("id", invite.id);

  return res.json({ success: true });
}
