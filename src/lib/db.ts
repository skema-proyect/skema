import { supabase } from "./supabase";
import type { Project, Conversation, Message, Note, CalendarEvent } from "@/types";

const uid = () => crypto.randomUUID();
const now = () => new Date().toISOString();

const getUid = async (): Promise<string | null> => {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user?.id ?? null;
};

// ── Projects ──────────────────────────────────────────────────────────────────
export const projects = {
  getAll: async (): Promise<Project[]> => {
    const { data } = await supabase
      .from("projects").select("*").order("created_at", { ascending: false });
    return (data ?? []).map(p => ({
      id: p.id, name: p.name, instructions: p.instructions ?? undefined,
      createdAt: p.created_at,
    }));
  },

  create: async (name: string): Promise<Project> => {
    const user_id = await getUid();
    const { data, error } = await supabase
      .from("projects").insert({ name, user_id }).select().single();
    if (error) throw new Error(error.message);
    return { id: data.id, name: data.name, createdAt: data.created_at };
  },

  rename: async (id: string, name: string) => {
    await supabase.from("projects").update({ name }).eq("id", id);
  },

  update: async (id: string, updates: Partial<Pick<Project, "name" | "instructions">>) => {
    await supabase.from("projects").update(updates).eq("id", id);
  },

  delete: async (id: string) => {
    await supabase.from("projects").delete().eq("id", id);
  },
};

// ── Conversations ─────────────────────────────────────────────────────────────
function mapConv(c: Record<string, unknown>): Conversation {
  return {
    id: c.id as string,
    title: c.title as string,
    projectId: (c.project_id as string | null) ?? null,
    messages: (c.messages as Message[]) ?? [],
    createdAt: c.created_at as string,
    updatedAt: c.updated_at as string,
  };
}

export const conversations = {
  getAll: async (): Promise<Conversation[]> => {
    const { data } = await supabase
      .from("conversations").select("*").order("updated_at", { ascending: false });
    return (data ?? []).map(mapConv);
  },

  get: async (id: string): Promise<Conversation | null> => {
    const { data } = await supabase
      .from("conversations").select("*").eq("id", id).single();
    return data ? mapConv(data) : null;
  },

  create: async (title = "Nueva conversación", projectId?: string | null): Promise<Conversation> => {
    const user_id = await getUid();
    const { data, error } = await supabase
      .from("conversations")
      .insert({ title, project_id: projectId ?? null, user_id })
      .select().single();
    if (error) throw new Error(error.message);
    return mapConv(data);
  },

  update: async (id: string, updates: {
    title?: string;
    projectId?: string | null;
    messages?: Message[];
  }) => {
    const row: Record<string, unknown> = { updated_at: now() };
    if (updates.title     !== undefined) row.title      = updates.title;
    if (updates.projectId !== undefined) row.project_id = updates.projectId;
    if (updates.messages  !== undefined) row.messages   = updates.messages;
    await supabase.from("conversations").update(row).eq("id", id);
  },

  delete: async (id: string) => {
    await supabase.from("conversations").delete().eq("id", id);
  },

  assignProject: async (conversationId: string, projectId: string | null) => {
    await supabase.from("conversations")
      .update({ project_id: projectId, updated_at: now() }).eq("id", conversationId);
  },
};

// ── Notes ─────────────────────────────────────────────────────────────────────
function mapNote(n: Record<string, unknown>): Note {
  return {
    id: n.id as string, title: n.title as string, content: n.content as string,
    createdAt: n.created_at as string, updatedAt: n.updated_at as string,
  };
}

export const notes = {
  getAll: async (): Promise<Note[]> => {
    const { data } = await supabase
      .from("notes").select("*").order("updated_at", { ascending: false });
    return (data ?? []).map(mapNote);
  },

  create: async (): Promise<Note> => {
    const user_id = await getUid();
    const { data, error } = await supabase
      .from("notes").insert({ title: "Sin título", content: "", user_id }).select().single();
    if (error) throw new Error(error.message);
    return mapNote(data);
  },

  update: async (id: string, updates: Partial<Pick<Note, "title" | "content">>) => {
    await supabase.from("notes").update({ ...updates, updated_at: now() }).eq("id", id);
  },

  delete: async (id: string) => {
    await supabase.from("notes").delete().eq("id", id);
  },
};

// ── Events ────────────────────────────────────────────────────────────────────
function mapEvent(e: Record<string, unknown>): CalendarEvent {
  return {
    id: e.id as string, title: e.title as string, date: e.date as string,
    startTime: (e.start_time as string) ?? undefined,
    endTime: (e.end_time as string) ?? undefined,
    description: (e.description as string) ?? undefined,
    color: (e.color as string) ?? "#000000",
    projectId: (e.project_id as string | null) ?? null,
  };
}

export const events = {
  getAll: async (): Promise<CalendarEvent[]> => {
    const { data } = await supabase.from("events").select("*").order("date");
    return (data ?? []).map(mapEvent);
  },

  forMonth: async (year: number, month: number): Promise<CalendarEvent[]> => {
    const start = `${year}-${String(month + 1).padStart(2, "0")}-01`;
    const end   = `${year}-${String(month + 1).padStart(2, "0")}-31`;
    const { data } = await supabase.from("events").select("*")
      .gte("date", start).lte("date", end).order("date");
    return (data ?? []).map(mapEvent);
  },

  create: async (ev: Omit<CalendarEvent, "id">): Promise<CalendarEvent> => {
    const user_id = await getUid();
    const { data, error } = await supabase.from("events").insert({
      title: ev.title, date: ev.date,
      start_time:  ev.startTime  ?? null,
      end_time:    ev.endTime    ?? null,
      description: ev.description ?? null,
      color:       ev.color ?? "#000000",
      project_id:  ev.projectId ?? null,
      user_id,
    }).select().single();
    if (error) throw new Error(error.message);
    return mapEvent(data);
  },

  update: async (id: string, updates: Partial<Omit<CalendarEvent, "id">>) => {
    const row: Record<string, unknown> = {};
    if (updates.title       !== undefined) row.title       = updates.title;
    if (updates.date        !== undefined) row.date        = updates.date;
    if (updates.startTime   !== undefined) row.start_time  = updates.startTime;
    if (updates.endTime     !== undefined) row.end_time    = updates.endTime;
    if (updates.description !== undefined) row.description = updates.description;
    if (updates.color       !== undefined) row.color       = updates.color;
    if (updates.projectId   !== undefined) row.project_id  = updates.projectId;
    await supabase.from("events").update(row).eq("id", id);
  },

  delete: async (id: string) => {
    await supabase.from("events").delete().eq("id", id);
  },
};

export { uid, now };
