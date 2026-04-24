export interface Project {
  id: string;
  name: string;
  createdAt: string;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  tool?: "chat" | "sketch" | "normativa" | "document" | "research";
  model?: string;
  svg?: string;
  timestamp: string;
}

export interface Conversation {
  id: string;
  title: string;
  projectId?: string | null;
  messages: Message[];
  createdAt: string;
  updatedAt: string;
}

export interface Note {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  date: string;        // YYYY-MM-DD
  startTime?: string;  // HH:MM
  endTime?: string;    // HH:MM
  description?: string;
  color?: string;
  projectId?: string | null;
}
