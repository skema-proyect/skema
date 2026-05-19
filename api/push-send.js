import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";

const admin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

webpush.setVapidDetails(
  `mailto:${process.env.VAPID_EMAIL}`,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const secret = req.headers["x-cron-secret"];
  if (secret !== process.env.CRON_SECRET) return res.status(401).json({ error: "Unauthorized" });

  const now = new Date();
  const today     = now.toISOString().split("T")[0];
  const tomorrow  = new Date(now.getTime() + 86400000).toISOString().split("T")[0];

  // Fetch events in today+tomorrow window that still need reminder
  const { data: eventsRaw } = await admin
    .from("events")
    .select("id, user_id, title, date, start_time, reminder_minutes")
    .in("date", [today, tomorrow])
    .not("reminder_minutes", "is", null)
    .not("reminder_sent", "is", true);

  const dueEvents = (eventsRaw ?? []).filter(ev => {
    if (!ev.start_time) return false;
    const eventTime    = new Date(`${ev.date}T${ev.start_time}:00`);
    const reminderTime = new Date(eventTime.getTime() - ev.reminder_minutes * 60_000);
    return Math.abs(now.getTime() - reminderTime.getTime()) <= 60_000;
  });

  if (!dueEvents.length) return res.json({ sent: 0 });

  let sent = 0;
  for (const ev of dueEvents) {
    const { data: subs } = await admin
      .from("push_subscriptions")
      .select("endpoint, keys")
      .eq("user_id", ev.user_id);

    const payload = JSON.stringify({
      title: `Recordatorio: ${ev.title}`,
      body:  `Hoy a las ${ev.start_time}`,
      tag:   `event-${ev.id}`,
      url:   "/agenda",
    });

    for (const sub of subs ?? []) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: JSON.parse(sub.keys) },
          payload
        );
        sent++;
      } catch (err) {
        if (err.statusCode === 410) {
          await admin.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
        }
      }
    }

    await admin.from("events").update({ reminder_sent: true }).eq("id", ev.id);
  }

  res.json({ sent });
}
