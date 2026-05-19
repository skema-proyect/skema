import { createClient } from "@supabase/supabase-js";

const admin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "No token" });

  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) return res.status(401).json({ error: "Invalid token" });

  const { endpoint, keys, expirationTime } = req.body;
  if (!endpoint || !keys) return res.status(400).json({ error: "Missing fields" });

  const { error: dbErr } = await admin.from("push_subscriptions").upsert({
    user_id:         user.id,
    endpoint,
    keys:            JSON.stringify(keys),
    expiration_time: expirationTime ?? null,
    updated_at:      new Date().toISOString(),
  }, { onConflict: "endpoint" });

  if (dbErr) return res.status(500).json({ error: dbErr.message });
  res.json({ ok: true });
}
