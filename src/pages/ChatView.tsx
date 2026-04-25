import { useState, useRef, useEffect, useCallback } from "react";
import { useOutletContext, useLocation } from "react-router-dom";
import { Send, Mic, MicOff, Square, PenTool, BookOpen, FileText, Search, Download } from "lucide-react";
import { conversations as convsDB } from "@/lib/storage";
import type { Message } from "@/types";

interface OutletCtx {
  currentConvId: string | null;
  setCurrentConvId: (id: string) => void;
  bump: () => void;
}

const CHIPS = [
  { icon: PenTool,  label: "Generar plano",        prompt: "Genera un plano de " },
  { icon: BookOpen, label: "Consultar normativa",   prompt: "¿Cuál es la normativa en Gran Canaria sobre " },
  { icon: FileText, label: "Redactar documento",    prompt: "Redacta un informe de " },
  { icon: Search,   label: "Investigar",            prompt: "Busca información actualizada sobre " },
];

export default function ChatView() {
  const { currentConvId, setCurrentConvId, bump } = useOutletContext<OutletCtx>();
  const location = useLocation();

  const conv      = currentConvId ? convsDB.get(currentConvId) : null;
  const messages  = conv?.messages ?? [];

  const [input,          setInput]          = useState("");
  const [loading,        setLoading]        = useState(false);
  const [loadingSeconds, setLoadingSeconds] = useState(0);
  const [listening,      setListening]      = useState(false);
  const bottomRef   = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mediaRef    = useRef<MediaRecorder | null>(null);
  const chunksRef   = useRef<Blob[]>([]);

  // Load initial prompt from navigation state (e.g. sidebar service shortcuts)
  useEffect(() => {
    const prompt = (location.state as { initialPrompt?: string } | null)?.initialPrompt;
    if (prompt) {
      setInput(prompt);
      // Clear state so back-navigation doesn't re-trigger
      window.history.replaceState({}, "");
    }
  }, [location.state]);

  // Contador de segundos mientras carga
  useEffect(() => {
    if (!loading) { setLoadingSeconds(0); return; }
    const interval = setInterval(() => setLoadingSeconds(s => s + 1), 1000);
    return () => clearInterval(interval);
  }, [loading]);

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 180) + "px";
  }, [input]);

  const getOrCreateConv = useCallback((): string => {
    if (currentConvId) return currentConvId;
    const c = convsDB.create();
    setCurrentConvId(c.id);
    return c.id;
  }, [currentConvId, setCurrentConvId]);

  const send = useCallback(async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || loading) return;
    setInput("");

    const convId = getOrCreateConv();
    convsDB.addMessage(convId, { role: "user", content });
    bump();
    setLoading(true);

    // Build history for API
    const updated = convsDB.get(convId);
    const history = (updated?.messages ?? []).map(m => ({ role: m.role, content: m.content }));

    try {
      const res  = await fetch("/api/chat", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ messages: history }),
      });
      const data = await res.json();
      convsDB.addMessage(convId, {
        role:    "assistant",
        content: data.content ?? "Sin respuesta.",
        tool:    data.tool,
        model:   data.model,
        svg:     data.svg,
      });
    } catch {
      convsDB.addMessage(convId, {
        role:    "assistant",
        content: "Error de conexión. Inténtalo de nuevo.",
        tool:    "chat",
      });
    } finally {
      setLoading(false);
      bump();
    }
  }, [input, loading, getOrCreateConv, bump]);

  // Voice recording
  const startVoice = async () => {
    try {
      const stream   = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      chunksRef.current = [];
      recorder.ondataavailable = e => chunksRef.current.push(e.data);
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob   = new Blob(chunksRef.current, { type: "audio/webm" });
        const reader = new FileReader();
        reader.onloadend = async () => {
          const b64 = (reader.result as string).split(",")[1];
          try {
            const res  = await fetch("/api/transcribe", {
              method:  "POST",
              headers: { "Content-Type": "application/json" },
              body:    JSON.stringify({ audioBase64: b64, mimeType: "audio/webm" }),
            });
            const data = await res.json();
            if (data.transcript) setInput(p => p ? p + " " + data.transcript : data.transcript);
          } catch { /* silently fail */ }
        };
        reader.readAsDataURL(blob);
      };
      recorder.start();
      mediaRef.current = recorder;
      setListening(true);
    } catch { /* microphone denied */ }
  };

  const stopVoice = () => {
    mediaRef.current?.stop();
    setListening(false);
  };

  // Download SVG
  const downloadSVG = (svg: string) => {
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = "plano-skema.svg"; a.click();
    URL.revokeObjectURL(url);
  };

  const hour = new Date().getHours();
  const timeGreeting = hour < 13 ? "Buenos días" : hour < 20 ? "Buenas tardes" : "Buenas noches";
  const userName = localStorage.getItem("skema_user_name");
  const greeting = userName ? `${timeGreeting}, ${userName}` : timeGreeting;

  return (
    <div className="flex flex-col h-full bg-s-bg">

      {/* Empty state */}
      {messages.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center px-4 pb-4">
          <img src="/hormiga-skema.png" alt="SKEMA" className="h-24 w-auto mb-4 opacity-90" />
          <h1 className="text-s-text text-2xl font-light mb-1">{greeting}</h1>
          <p className="text-s-muted text-sm mb-5">¿En qué puedo ayudarte hoy?</p>
          <div className="flex flex-wrap gap-2 justify-center max-w-lg">
            {CHIPS.map(({ icon: Icon, label, prompt }) => (
              <button
                key={label}
                onClick={() => setInput(prompt)}
                className="flex items-center gap-2 px-4 py-2.5 border border-s-border rounded-lg text-[15px] sm:text-[13px] text-s-muted hover:text-s-text hover:border-s-text transition-colors"
              >
                <Icon size={13} />
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Messages */}
      {messages.length > 0 && (
        <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
          {messages.map(m => (
            <MessageBubble key={m.id} message={m} onDownloadSVG={downloadSVG} />
          ))}
          {loading && (
            <div className="flex gap-3 max-w-2xl">
              <div className="w-7 h-7 rounded-full bg-s-accent flex-shrink-0 flex items-center justify-center">
                <img src="/logo-skema.png" alt="" className="w-4 h-4 invert" />
              </div>
              <div className="pt-1">
                {loadingSeconds < 3 ? (
                  <TypingDots />
                ) : loadingSeconds < 10 ? (
                  <LoadingText text="Buscando información actualizada..." />
                ) : loadingSeconds < 30 ? (
                  <LoadingText text="Analizando fuentes..." />
                ) : (
                  <LoadingText text="Investigando en profundidad... puede tardar hasta un minuto" />
                )}
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      )}

      {/* Input bar */}
      <div className="px-3 pt-2" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1.25rem)' }}>
        <div className="max-w-2xl mx-auto">
          <div className="flex items-end gap-2">
            {/* Pill input */}
            <div className="flex-1 border border-s-border rounded-full bg-s-surface focus-within:border-s-text transition-colors px-5 py-3">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => {
                  const isMobile = window.matchMedia("(pointer: coarse)").matches;
                  if (e.key === "Enter" && !e.shiftKey && !isMobile) { e.preventDefault(); send(); }
                }}
                placeholder={listening ? "Escuchando..." : "Escribe o habla con SKEMA..."}
                rows={1}
                className="w-full text-[17px] sm:text-[15px] text-s-text bg-transparent outline-none resize-none placeholder:text-s-muted leading-snug"
              />
            </div>

            {/* Circle action button */}
            {input.trim() ? (
              <button
                onClick={() => send()}
                disabled={loading}
                className="w-12 h-12 rounded-full bg-black text-white flex items-center justify-center flex-shrink-0 hover:opacity-75 disabled:opacity-30 transition-opacity"
                title="Enviar"
              >
                <Send size={19} />
              </button>
            ) : listening ? (
              <button
                onClick={stopVoice}
                className="w-12 h-12 rounded-full bg-red-500 text-white flex items-center justify-center flex-shrink-0 animate-pulse"
                title="Detener grabación"
              >
                <MicOff size={19} />
              </button>
            ) : (
              <button
                onClick={startVoice}
                className="w-12 h-12 rounded-full bg-black text-white flex items-center justify-center flex-shrink-0 hover:opacity-75 transition-opacity"
                title="Hablar"
              >
                <Mic size={19} />
              </button>
            )}
          </div>
          <p className="text-center text-[11px] text-s-muted mt-2">
            SKEMA puede cometer errores. Verifica la información importante.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Message bubble ────────────────────────────────────────────────────────────
function MessageBubble({ message: m, onDownloadSVG }: { message: Message; onDownloadSVG: (svg: string) => void }) {
  if (m.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[75%] bg-s-surface border border-s-border rounded-2xl px-4 py-3 text-[16px] sm:text-[14px] text-s-text whitespace-pre-wrap">
          {m.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3 max-w-2xl">
      <div className="w-7 h-7 rounded-full bg-s-accent flex-shrink-0 flex items-center justify-center mt-0.5">
        <img src="/logo-skema.png" alt="" className="w-4 h-4 invert" />
      </div>
      <div className="flex-1 space-y-3">
        <div className="text-[16px] sm:text-[14px] text-s-text leading-relaxed whitespace-pre-wrap">{m.content}</div>
        {m.svg && (
          <div className="border border-s-border rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-s-border bg-s-surface">
              <span className="text-[11px] text-s-muted uppercase tracking-wider">Plano esquemático</span>
              <button
                onClick={() => onDownloadSVG(m.svg!)}
                className="flex items-center gap-1.5 text-[11px] text-s-muted hover:text-s-text transition-colors"
              >
                <Download size={12} /> Descargar SVG
              </button>
            </div>
            <div className="bg-white p-2" dangerouslySetInnerHTML={{ __html: m.svg }} />
          </div>
        )}
        {m.model && (
          <span className="text-[10px] text-s-muted">
            {m.model.includes("perplexity") ? "Perplexity"
              : m.model.includes("haiku") ? "Haiku"
              : "Sonnet"}
            {m.tool && m.tool !== "chat" ? ` · ${m.tool}` : ""}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Loading text ───────────────────────────────────────────────────────────────
function LoadingText({ text }: { text: string }) {
  return (
    <p className="text-[13px] text-s-muted italic animate-pulse">{text}</p>
  );
}

// ── Typing dots ────────────────────────────────────────────────────────────────
function TypingDots() {
  return (
    <div className="flex gap-1 items-center h-6">
      {[0, 1, 2].map(i => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-s-muted animate-bounce"
          style={{ animationDelay: `${i * 0.15}s`, animationDuration: "0.8s" }}
        />
      ))}
    </div>
  );
}

// Prevent unused import warning
const _StopIcon = Square;
void _StopIcon;
