import { useState, useRef, useEffect, useCallback } from "react";
import { useOutletContext, useLocation } from "react-router-dom";
import { Send, Mic, Download } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { conversations as convsDB, uid, now } from "@/lib/db";
import { SERVICES } from "@/constants/services";
import { useAuth } from "@/lib/auth";
import type { Message } from "@/types";

interface OutletCtx {
  currentConvId: string | null;
  setCurrentConvId: (id: string) => void;
  bump: () => void;
}

export default function ChatView() {
  const { currentConvId, setCurrentConvId, bump } = useOutletContext<OutletCtx>();
  const location = useLocation();
  const { profile } = useAuth();

  const [messages,        setMessages]        = useState<Message[]>([]);
  const [input,           setInput]           = useState("");
  const [loading,         setLoading]         = useState(false);
  const [loadingSeconds,  setLoadingSeconds]  = useState(0);
  const [listening,       setListening]       = useState(false);
  const bottomRef       = useRef<HTMLDivElement>(null);
  const textareaRef     = useRef<HTMLTextAreaElement>(null);
  const recognitionRef  = useRef<any>(null);
  const finalsRef       = useRef<string>("");
  const pendingSendRef  = useRef<boolean>(false);
  const convIdRef       = useRef<string | null>(currentConvId);

  // Keep ref in sync so closures always see the latest convId
  useEffect(() => { convIdRef.current = currentConvId; }, [currentConvId]);

  // Load conversation from Supabase when convId changes
  useEffect(() => {
    if (!currentConvId) { setMessages([]); return; }
    convsDB.get(currentConvId).then(conv => setMessages(conv?.messages ?? []));
  }, [currentConvId]);

  // Load initial prompt from navigation state
  useEffect(() => {
    const prompt = (location.state as { initialPrompt?: string } | null)?.initialPrompt;
    if (prompt) { setInput(prompt); window.history.replaceState({}, ""); }
  }, [location.state]);

  // Loading counter
  useEffect(() => {
    if (!loading) { setLoadingSeconds(0); return; }
    const t = setInterval(() => setLoadingSeconds(s => s + 1), 1000);
    return () => clearInterval(t);
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

  const send = useCallback(async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || loading) return;
    setInput("");

    // Get or create conversation
    let convId = convIdRef.current;
    if (!convId) {
      const conv = await convsDB.create();
      convId = conv.id;
      convIdRef.current = convId;
      setCurrentConvId(convId);
    }

    // Add user message optimistically
    const userMsg: Message = { id: uid(), role: "user", content, timestamp: now() };
    const withUser = [...messages, userMsg];
    setMessages(withUser);

    // Persist (title set on first message)
    await convsDB.update(convId, {
      messages: withUser,
      ...(messages.length === 0 ? { title: content.slice(0, 50) + (content.length > 50 ? "…" : "") } : {}),
    });
    bump();
    setLoading(true);

    const history = withUser.map(m => ({ role: m.role, content: m.content, tool: m.tool }));

    try {
      const res  = await fetch("/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });
      const data = await res.json();

      const assistantMsg: Message = {
        id:      uid(),
        role:    "assistant",
        content: data.content ?? "Sin respuesta.",
        tool:    data.tool,
        model:   data.model,
        svg:     data.svg,
        timestamp: now(),
      };
      const withAssistant = [...withUser, assistantMsg];
      setMessages(withAssistant);
      await convsDB.update(convId, { messages: withAssistant });
    } catch {
      const errMsg: Message = { id: uid(), role: "assistant", content: "Error de conexión. Inténtalo de nuevo.", tool: "chat", timestamp: now() };
      const withErr = [...withUser, errMsg];
      setMessages(withErr);
      await convsDB.update(convId, { messages: withErr });
    } finally {
      setLoading(false);
      bump();
    }
  }, [input, loading, messages, setCurrentConvId, bump]);

  // ── Voice ────────────────────────────────────────────────────────────────────
  const startVoice = () => {
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!SR) { alert("Tu navegador no soporta reconocimiento de voz. Usa Chrome o Safari."); return; }
    finalsRef.current = "";
    setListening(true);

    const launchRec = () => {
      const rec = new SR();
      rec.lang = "es-ES"; rec.continuous = false; rec.interimResults = false;
      rec.onresult = (e: SpeechRecognitionEvent) => {
        const t = e.results[0][0].transcript.trim();
        if (t) finalsRef.current += (finalsRef.current ? " " : "") + t;
      };
      rec.onerror = (e: any) => {
        if (e.error === "not-allowed") { recognitionRef.current = null; setListening(false); }
      };
      rec.onend = () => {
        if (pendingSendRef.current) {
          pendingSendRef.current = false;
          const text = finalsRef.current.trim();
          finalsRef.current = "";
          setListening(false);
          if (text) send(text);
          return;
        }
        if (recognitionRef.current !== null) {
          setTimeout(() => { if (recognitionRef.current !== null) launchRec(); }, 350);
        }
      };
      rec.start();
      recognitionRef.current = rec;
    };
    launchRec();
  };

  const cancelVoice = () => {
    const rec = recognitionRef.current;
    recognitionRef.current = null;
    rec?.stop();
    finalsRef.current = "";
    setListening(false);
  };

  const sendVoice = () => {
    const existing = finalsRef.current.trim();
    if (existing) {
      const rec = recognitionRef.current;
      recognitionRef.current = null;
      rec?.stop();
      finalsRef.current = "";
      setListening(false);
      send(existing);
      return;
    }
    pendingSendRef.current = true;
    const rec = recognitionRef.current;
    recognitionRef.current = null;
    rec?.stop();
  };

  const downloadSVG = (svg: string) => {
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = "plano-skema.svg"; a.click();
    URL.revokeObjectURL(url);
  };

  const hour = new Date().getHours();
  const timeGreeting = hour < 13 ? "Buenos días" : hour < 20 ? "Buenas tardes" : "Buenas noches";
  const userName = profile?.name ?? localStorage.getItem("skema_user_name");
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
                {loadingSeconds < 3  ? <TypingDots /> :
                 loadingSeconds < 10 ? <LoadingText text="Buscando información actualizada..." /> :
                 loadingSeconds < 30 ? <LoadingText text="Analizando fuentes..." /> :
                                       <LoadingText text="Investigando en profundidad... puede tardar hasta un minuto" />}
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      )}

      {/* Voice overlay */}
      {listening && (
        <div className="absolute inset-x-0 bottom-0 z-50 flex flex-col items-center justify-end pb-6 pt-8"
          style={{ background: "linear-gradient(to top, rgba(0,0,0,0.82) 60%, transparent)" }}>
          <div className="flex items-center gap-1.5 h-14 mb-6">
            {[0,1,2,3,4,5,6].map(i => (
              <div key={i} className="w-1 rounded-full bg-white"
                style={{ animation: "voiceWave 0.9s ease-in-out infinite alternate", animationDelay: `${i * 0.12}s`, height: "12px" }}
              />
            ))}
          </div>
          <p className="text-white/60 text-[13px] mb-6">Escuchando...</p>
          <div className="flex items-center gap-6">
            <button onClick={cancelVoice}
              className="w-12 h-12 rounded-full bg-white/15 text-white flex items-center justify-center text-xl hover:bg-white/25 transition-colors"
              title="Cancelar">✕</button>
            <button onClick={sendVoice}
              className="w-16 h-16 rounded-full bg-white text-black flex items-center justify-center flex-shrink-0 hover:opacity-90 transition-opacity shadow-lg"
              title="Enviar"><Send size={22} /></button>
          </div>
        </div>
      )}

      {/* Input bar */}
      <div className="px-3 pt-2" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1.25rem)' }}>
        <div className="max-w-2xl mx-auto">
          <div className="flex items-end gap-2">
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
            {input.trim() ? (
              <button onClick={() => send()} disabled={loading}
                className="w-12 h-12 rounded-full bg-black text-white flex items-center justify-center flex-shrink-0 hover:opacity-75 disabled:opacity-30 transition-opacity"
                title="Enviar"><Send size={19} /></button>
            ) : !listening ? (
              <button onClick={startVoice}
                className="w-12 h-12 rounded-full bg-black text-white flex items-center justify-center flex-shrink-0 hover:opacity-75 transition-opacity"
                title="Hablar"><Mic size={19} /></button>
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
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {(m.content ?? "").replace(/\n*<!--SPEC:[\s\S]*?-->/g, "").trim()}
          </ReactMarkdown>
        </div>
        {m.svg && (
          <div className="border border-s-border rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-s-border bg-s-surface">
              <span className="text-[11px] text-s-muted uppercase tracking-wider">Plano esquemático</span>
              <button onClick={() => onDownloadSVG(m.svg!)}
                className="flex items-center gap-1.5 text-[11px] text-s-muted hover:text-s-text transition-colors">
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
            {m.model.includes("perplexity") ? "Perplexity" : m.model.includes("haiku") ? "Haiku" : "Sonnet"}
            {m.tool && m.tool !== "chat" && m.tool !== "search" ? ` · ${m.tool}` : ""}
          </span>
        )}
      </div>
    </div>
  );
}

function LoadingText({ text }: { text: string }) {
  return <p className="text-[13px] text-s-muted italic animate-pulse">{text}</p>;
}

function TypingDots() {
  return (
    <div className="flex gap-1 items-center h-6">
      {[0, 1, 2].map(i => (
        <span key={i} className="w-1.5 h-1.5 rounded-full bg-s-muted animate-bounce"
          style={{ animationDelay: `${i * 0.15}s`, animationDuration: "0.8s" }} />
      ))}
    </div>
  );
}
