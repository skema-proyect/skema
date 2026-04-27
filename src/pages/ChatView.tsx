import { useState, useRef, useEffect, useCallback } from "react";
import { useOutletContext, useLocation } from "react-router-dom";
import { Send, Mic, Download } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { conversations as convsDB } from "@/lib/storage";
import { SERVICES } from "@/constants/services";
import type { Message } from "@/types";

interface OutletCtx {
  currentConvId: string | null;
  setCurrentConvId: (id: string) => void;
  bump: () => void;
}

export default function ChatView() {
  const { currentConvId, setCurrentConvId, bump } = useOutletContext<OutletCtx>();
  const location = useLocation();

  const conv      = currentConvId ? convsDB.get(currentConvId) : null;
  const messages  = conv?.messages ?? [];

  const [input,          setInput]          = useState("");
  const [loading,        setLoading]        = useState(false);
  const [loadingSeconds, setLoadingSeconds] = useState(0);
  const [listening,      setListening]      = useState(false);
  const [voiceText,      setVoiceText]      = useState("");
  const bottomRef        = useRef<HTMLDivElement>(null);
  const textareaRef      = useRef<HTMLTextAreaElement>(null);
  const recognitionRef   = useRef<any>(null);

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

  // Voice — Gemini-style overlay with Web Speech API
  const startVoice = () => {
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!SR) { alert("Tu navegador no soporta reconocimiento de voz. Usa Chrome o Safari."); return; }

    // Small delay so browser fully releases mic from previous session
    setTimeout(() => {
      const rec = new SR();
      rec.lang = "es-ES";
      rec.continuous = true;
      rec.interimResults = false;

      rec.onresult = (e: SpeechRecognitionEvent) => {
        // Always read ALL final results from scratch — prevents repetition bug
        let text = "";
        for (let i = 0; i < e.results.length; i++) {
          if (e.results[i].isFinal) text += e.results[i][0].transcript + " ";
        }
        setVoiceText(text.trim());
      };

      rec.onerror = (e: any) => {
        if (e.error !== "no-speech") setListening(false);
      };
      rec.onend = () => { /* keep overlay open — user presses send or cancel */ };

      rec.start();
      recognitionRef.current = rec;
      setVoiceText("");
      setListening(true);
    }, 150);
  };

  const cancelVoice = () => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setListening(false);
    setVoiceText("");
  };

  const sendVoice = () => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    const text = voiceText.trim();
    setListening(false);
    setVoiceText("");
    if (text) send(text);
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
    <div className="relative flex flex-col h-full bg-s-bg">

      {/* Empty state */}
      {messages.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center px-4 pb-4">
          <img src="/hormiga-skema.png" alt="SKEMA" className="h-24 w-auto mb-4 opacity-90" />
          <h1 className="text-s-text text-2xl font-light mb-1">{greeting}</h1>
          <p className="text-s-muted text-sm mb-5">¿En qué puedo ayudarte hoy?</p>
          <div className="flex flex-wrap gap-2 justify-center max-w-lg">
            {SERVICES.map(({ icon: Icon, label, prompt }) => (
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
              <img src="/ant-skema.png" alt="" className="w-7 h-7 flex-shrink-0 mt-0.5 object-contain" />
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

      {/* Voice overlay — Gemini style */}
      {listening && (
        <div className="absolute inset-x-0 bottom-0 z-50 flex flex-col items-center justify-end pb-6 pt-8"
          style={{ background: "linear-gradient(to top, rgba(0,0,0,0.82) 60%, transparent)" }}>
          {/* Wave bars */}
          <div className="flex items-center gap-1.5 h-14 mb-6">
            {[0,1,2,3,4,5,6].map(i => (
              <div
                key={i}
                className="w-1 rounded-full bg-white"
                style={{
                  animation: `voiceWave 0.9s ease-in-out infinite alternate`,
                  animationDelay: `${i * 0.12}s`,
                  height: "12px",
                }}
              />
            ))}
          </div>
          <p className="text-white/60 text-[13px] mb-6">Escuchando...</p>
          {/* Buttons */}
          <div className="flex items-center gap-6">
            <button
              onClick={cancelVoice}
              className="w-12 h-12 rounded-full bg-white/15 text-white flex items-center justify-center text-xl hover:bg-white/25 transition-colors"
              title="Cancelar"
            >✕</button>
            <button
              onClick={sendVoice}
              className="w-16 h-16 rounded-full bg-white text-black flex items-center justify-center flex-shrink-0 hover:opacity-90 transition-opacity shadow-lg"
              title="Enviar"
            >
              <Send size={22} />
            </button>
          </div>
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
            ) : !listening ? (
              <button
                onClick={startVoice}
                className="w-12 h-12 rounded-full bg-black text-white flex items-center justify-center flex-shrink-0 hover:opacity-75 transition-opacity"
                title="Hablar"
              >
                <Mic size={19} />
              </button>
            ) : null}
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
      <img src="/ant-skema.png" alt="" className="w-7 h-7 flex-shrink-0 mt-0.5 object-contain" />
      <div className="flex-1 space-y-3">
        <div className="text-[16px] sm:text-[14px] text-s-text leading-relaxed prose prose-sm max-w-none prose-p:my-1 prose-headings:text-s-text prose-strong:text-s-text prose-li:my-0.5">
          <ReactMarkdown>{m.content}</ReactMarkdown>
        </div>
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
            <div className="bg-white p-2 overflow-x-auto">
              {m.svg?.startsWith("<svg") ? (
                <div dangerouslySetInnerHTML={{ __html: m.svg }} style={{ maxWidth: "100%", height: "auto" }} />
              ) : (
                <p className="text-[12px] text-s-muted p-2">No se pudo renderizar el plano.</p>
              )}
            </div>
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

