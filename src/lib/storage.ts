import type { Project, Conversation, Message, Note, CalendarEvent } from "@/types";

const uid = () => crypto.randomUUID();
const now = () => new Date().toISOString();

// ── Keys ──────────────────────────────────────────────────────────────────────
const KEYS = {
  projects:      "skema_projects",
  conversations: "skema_conversations",
  notes:         "skema_notes",
  events:        "skema_events",
};

function load<T>(key: string): T[] {
  try { return JSON.parse(localStorage.getItem(key) ?? "[]"); }
  catch { return []; }
}
function save<T>(key: string, data: T[]) {
  localStorage.setItem(key, JSON.stringify(data));
}

// ── Projects ──────────────────────────────────────────────────────────────────
export const projects = {
  getAll: (): Project[] => load<Project>(KEYS.projects),

  create: (name: string): Project => {
    const item: Project = { id: uid(), name, createdAt: now() };
    save(KEYS.projects, [item, ...projects.getAll()]);
    return item;
  },

  rename: (id: string, name: string) => {
    save(KEYS.projects, projects.getAll().map(p => p.id === id ? { ...p, name } : p));
  },

  delete: (id: string) => {
    save(KEYS.projects, projects.getAll().filter(p => p.id !== id));
    // Unassign conversations from deleted project
    const convs = conversations.getAll().map(c =>
      c.projectId === id ? { ...c, projectId: null } : c
    );
    save(KEYS.conversations, convs);
  },
};

// ── Conversations ─────────────────────────────────────────────────────────────
export const conversations = {
  getAll: (): Conversation[] => load<Conversation>(KEYS.conversations),

  get: (id: string): Conversation | null =>
    conversations.getAll().find(c => c.id === id) ?? null,

  create: (title = "Nueva conversación", projectId?: string | null): Conversation => {
    const item: Conversation = {
      id: uid(), title, projectId: projectId ?? null,
      messages: [], createdAt: now(), updatedAt: now(),
    };
    save(KEYS.conversations, [item, ...conversations.getAll()]);
    return item;
  },

  update: (id: string, updates: Partial<Conversation>) => {
    save(KEYS.conversations, conversations.getAll().map(c =>
      c.id === id ? { ...c, ...updates, updatedAt: now() } : c
    ));
  },

  delete: (id: string) => {
    save(KEYS.conversations, conversations.getAll().filter(c => c.id !== id));
  },

  addMessage: (conversationId: string, msg: Omit<Message, "id" | "timestamp">): Message => {
    const message: Message = { ...msg, id: uid(), timestamp: now() };
    const conv = conversations.get(conversationId);
    if (!conv) return message;
    const updated = { ...conv, messages: [...conv.messages, message] };
    // Auto-title from first user message
    if (conv.messages.length === 0 && msg.role === "user") {
      updated.title = msg.content.slice(0, 50) + (msg.content.length > 50 ? "…" : "");
    }
    conversations.update(conversationId, updated);
    return message;
  },

  assignProject: (conversationId: string, projectId: string | null) => {
    conversations.update(conversationId, { projectId });
  },
};

// ── Notes ─────────────────────────────────────────────────────────────────────
export const notes = {
  getAll: (): Note[] => load<Note>(KEYS.notes),

  get: (id: string): Note | null =>
    notes.getAll().find(n => n.id === id) ?? null,

  create: (): Note => {
    const item: Note = { id: uid(), title: "Sin título", content: "", createdAt: now(), updatedAt: now() };
    save(KEYS.notes, [item, ...notes.getAll()]);
    return item;
  },

  update: (id: string, updates: Partial<Note>) => {
    save(KEYS.notes, notes.getAll().map(n =>
      n.id === id ? { ...n, ...updates, updatedAt: now() } : n
    ));
  },

  delete: (id: string) => {
    save(KEYS.notes, notes.getAll().filter(n => n.id !== id));
  },
};

// ── Events ────────────────────────────────────────────────────────────────────
export const events = {
  getAll: (): CalendarEvent[] => load<CalendarEvent>(KEYS.events),

  forDate: (date: string): CalendarEvent[] =>
    events.getAll().filter(e => e.date === date),

  forMonth: (year: number, month: number): CalendarEvent[] => {
    const prefix = `${year}-${String(month + 1).padStart(2, "0")}`;
    return events.getAll().filter(e => e.date.startsWith(prefix));
  },

  create: (data: Omit<CalendarEvent, "id">): CalendarEvent => {
    const item: CalendarEvent = { ...data, id: uid() };
    save(KEYS.events, [...events.getAll(), item]);
    return item;
  },

  update: (id: string, updates: Partial<CalendarEvent>) => {
    save(KEYS.events, events.getAll().map(e => e.id === id ? { ...e, ...updates } : e));
  },

  delete: (id: string) => {
    save(KEYS.events, events.getAll().filter(e => e.id !== id));
  },
};
