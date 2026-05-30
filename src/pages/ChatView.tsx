import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useOutletContext, useLocation } from "react-router-dom";
import { Send, Mic, Download, CalendarCheck, StickyNote, FileDown, X, Check, Plus, Camera, Image as ImageIcon, Paperclip, Globe, Search } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { conversations as convsDB, projects as projectsDB, events as eventsDB, notes as notesDB, uid, now } from "@/lib/db";
import { SERVICES } from "@/constants/services";
import { useAuth } from "@/lib/auth";
import FloorPlanCard from "@/components/FloorPlanCard";
import { downloadPDF, downloadWord, downloadCSV, hasTable, extractDocTitle } from "@/lib/docExport";
import type { Message, Project } from "@/types";

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
  const [projectInstructions, setProjectInstructions] = useState<string | null>(null);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [attachedFile,   setAttachedFile]   = useState<{ name: string; mediaType: string; base64: string; preview?: string } | null>(null);
  const [searchMode,         setSearchMode]         = useState(false);
  const [investigationMode,  setInvestigationMode]  = useState(false);
  const [invData,            setInvData]            = useState({ context: "", query: "", format: "" });
  const [isMultiLine,        setIsMultiLine]        = useState(false);
  const [analyzingFile,      setAnalyzingFile]      = useState(false);

  const bottomRef       = useRef<HTMLDivElement>(null);
  const textareaRef     = useRef<HTMLTextAreaElement>(null);
  const recognitionRef  = useRef<any>(null);
  const finalsRef       = useRef<string>("");
  const pendingSendRef  = useRef<boolean>(false);
  const convIdRef       = useRef<string | null>(currentConvId);
  const attachMenuRef   = useRef<HTMLDivElement>(null);
  const cameraInputRef  = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef    = useRef<HTMLInputElement>(null);

  // Keep ref in sync so closures always see the latest convId
  useEffect(() => { convIdRef.current = currentConvId; }, [currentConvId]);

  // Load conversation + project instructions when convId changes
  useEffect(() => {
    if (!currentConvId) { setMessages([]); setProjectInstructions(null); return; }
    convsDB.get(currentConvId).then(async conv => {
      setMessages(conv?.messages ?? []);
      if (conv?.projectId) {
        const allProjects = await projectsDB.getAll();
        const proj = allProjects.find(p => p.id === conv.projectId);
        setProjectInstructions(proj?.instructions ?? null);
      } else {
        setProjectInstructions(null);
      }
    });
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

  // Auto-resize textarea + adaptive shape
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 180) + "px";
    setIsMultiLine(ta.scrollHeight > 52);
  }, [input]);

  // Close attach menu on outside click
  useEffect(() => {
    if (!showAttachMenu) return;
    const handler = (e: MouseEvent) => {
      if (!attachMenuRef.current?.contains(e.target as Node)) setShowAttachMenu(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showAttachMenu]);

  const send = useCallback(async (text?: string, options?: { forceDeep?: boolean }) => {
    let content = (text ?? input).trim();
    const currentFile = attachedFile;
    if (!content && !currentFile) return;
    if (loading) return;

    if (searchMode && content) content = `Busca información actualizada sobre ${content}`;

    setInput("");
    setAnalyzingFile(!!currentFile);
    setAttachedFile(null);
    setSearchMode(false);

    // Get or create conversation
    let convId = convIdRef.current;
    let isNewConv = false;
    if (!convId) {
      const conv = await convsDB.create();
      convId = conv.id;
      convIdRef.current = convId;
      isNewConv = true;
    }

    // Add user message optimistically
    const userMsg: Message = {
      id: uid(), role: "user", content, timestamp: now(),
      ...(currentFile ? { attachment: { name: currentFile.name, mediaType: currentFile.mediaType } } : {}),
    };
    const withUser = [...messages, userMsg];
    setMessages(withUser);

    // Persist (title set on first message)
    const titleText = content || currentFile?.name || "Archivo adjunto";
    await convsDB.update(convId, {
      messages: withUser,
      ...(messages.length === 0 ? { title: titleText.slice(0, 50) + (titleText.length > 50 ? "…" : "") } : {}),
    });
    // Notify parent of new convId only after DB has the message — prevents useEffect
    // from re-loading an empty conversation and wiping the optimistic user message.
    if (isNewConv) setCurrentConvId(convId);
    bump();
    setLoading(true);

    const history = withUser.map(m => ({ role: m.role, content: m.content, tool: m.tool }));

    // Pass existing planId if there's a floorplan in this conversation
    const existingPlanMsg = [...withUser].reverse().find(m => m.floorPlan?.planId);

    try {
      const res  = await fetch("/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history,
          projectInstructions: projectInstructions ?? undefined,
          userInstructions: profile?.instructions ?? undefined,
          today: new Date().toISOString().split("T")[0],
          conversationId: convId,
          userId: profile?.id ?? undefined,
          existingPlanId: existingPlanMsg?.floorPlan?.planId ?? undefined,
          ...(currentFile ? { attachedFile: { name: currentFile.name, mediaType: currentFile.mediaType, base64: currentFile.base64 } } : {}),
          ...(options?.forceDeep ? { forceDeep: true } : {}),
        }),
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
        ...(data.planId ? { floorPlan: { planId: data.planId, version: data.version ?? 1 } } : {}),
      };
      const withAssistant = [...withUser, assistantMsg];
      setMessages(withAssistant);
      await convsDB.update(convId, { messages: withAssistant });

      if (data.eventData) {
        try { await eventsDB.create(data.eventData); } catch {}
      }
      if (data.noteData) {
        try {
          const n = await notesDB.create();
          await notesDB.update(n.id, { title: data.noteData.title, content: data.noteData.content });
        } catch {}
      }
    } catch {
      const errMsg: Message = { id: uid(), role: "assistant", content: "Error de conexión. Inténtalo de nuevo.", tool: "chat", timestamp: now() };
      const withErr = [...withUser, errMsg];
      setMessages(withErr);
      await convsDB.update(convId, { messages: withErr });
    } finally {
      setLoading(false);
      setAnalyzingFile(false);
      bump();
    }
  }, [input, loading, messages, setCurrentConvId, bump, attachedFile, searchMode]);

  const sendInvestigation = useCallback(() => {
    if (!invData.query.trim() || loading) return;
    const parts: string[] = [];
    if (invData.context.trim()) parts.push(`Contexto: ${invData.context.trim()}`);
    parts.push(invData.query.trim());
    if (invData.format.trim()) parts.push(`Formato de respuesta: ${invData.format.trim()}`);
    const prompt = parts.join("\n");
    setInvestigationMode(false);
    setInvData({ context: "", query: "", format: "" });
    send(prompt, { forceDeep: true });
  }, [invData, loading, send]);

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

  const handleFileSelect = async (file: File | null) => {
    setShowAttachMenu(false);
    if (!file) return;
    try {
      let base64: string;
      let mediaType = file.type || "application/octet-stream";
      if (file.type.startsWith("image/")) {
        // Compress to max 1024px JPEG to stay well under Vercel's 4.5MB body limit
        base64 = await new Promise<string>((resolve, reject) => {
          const img = new Image();
          const url = URL.createObjectURL(file);
          img.onload = () => {
            URL.revokeObjectURL(url);
            const MAX = 1024;
            let { width, height } = img;
            if (width > MAX || height > MAX) {
              const r = Math.min(MAX / width, MAX / height);
              width = Math.round(width * r); height = Math.round(height * r);
            }
            const canvas = document.createElement("canvas");
            canvas.width = width; canvas.height = height;
            canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL("image/jpeg", 0.85).split(",")[1]);
          };
          img.onerror = reject;
          img.src = url;
        });
        mediaType = "image/jpeg";
      } else {
        if (file.size > 3 * 1024 * 1024) {
          alert("El archivo no puede superar 3 MB. Intenta dividir el PDF o comprimir el documento.");
          return;
        }
        base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve((reader.result as string).split(",")[1]);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      }
      const preview = mediaType === "image/jpeg" ? `data:image/jpeg;base64,${base64}` : undefined;
      setAttachedFile({ name: file.name, mediaType, base64, preview });
    } catch {
      alert("No se pudo leer el archivo. Inténtalo de nuevo.");
    }
  };

  const downloadSVG = (svg: string) => {
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = "plano-skema.svg"; a.click();
    URL.revokeObjectURL(url);
  };

  const hour = new Date().getHours();
  const timeGreeting = hour >= 5 && hour < 12 ? "Buenos días" : hour >= 12 && hour < 20 ? "Buenas tardes" : "Buenas noches";
  const fullName = profile?.name ?? localStorage.getItem("skema_user_name");
  const firstName = fullName?.split(" ")[0] ?? null;

  const [visitCtx] = useState(() => {
    const today = new Date().toDateString();
    const lastDate = localStorage.getItem("skema_last_visit_date");
    const lastTime = parseInt(localStorage.getItem("skema_last_visit") || "0");
    const prevVisits = lastDate === today ? parseInt(localStorage.getItem("skema_visits_today") || "0") : 0;
    const hoursSinceLast = lastTime ? (Date.now() - lastTime) / 3600000 : 999;
    const isFirstToday = lastDate !== today;
    const currentVisits = prevVisits + 1;
    localStorage.setItem("skema_last_visit_date", today);
    localStorage.setItem("skema_last_visit", Date.now().toString());
    localStorage.setItem("skema_visits_today", currentVisits.toString());
    return { isFirstToday, hoursSinceLast, currentVisits };
  });

  const greeting = useMemo(() => {
    const base = firstName ? `${timeGreeting}, ${firstName}` : timeGreeting;
    if (!visitCtx.isFirstToday && visitCtx.hoursSinceLast >= 4)
      return firstName ? `Bienvenido de vuelta, ${firstName}` : "Bienvenido de vuelta";
    return base;
  }, [firstName, timeGreeting, visitCtx]);

  const subtitle = useMemo(() => {
    if (visitCtx.currentVisits >= 3)          return "¿Qué más tienes?";
    if (!visitCtx.isFirstToday && visitCtx.hoursSinceLast < 1)  return "¿Seguimos?";
    if (!visitCtx.isFirstToday && visitCtx.hoursSinceLast >= 4) return "¿Por dónde empezamos?";
    if (hour >= 22 || hour < 5)               return "¿Qué más sacamos?";
    if (hour >= 5  && hour < 12)              return "¿Qué tenemos hoy?";
    if (hour >= 12 && hour < 20)              return "¿En qué te ayudo?";
    return "¿Qué necesitas?";
  }, [visitCtx, hour]);

  return (
    <div className="relative flex flex-col h-full bg-s-bg">

      {/* Empty state */}
      {messages.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center px-4 pb-4">
          <img src="/hormiga-skema.png" alt="SKEMA" className="h-24 w-auto mb-4 opacity-90" />
          <h1 className="text-s-text text-2xl font-light mb-1">{greeting}</h1>
          <p className="text-s-muted text-sm mb-5">{subtitle}</p>
          <div className="flex flex-wrap gap-2 justify-center max-w-lg">
            {SERVICES.map(({ icon: Icon, label, prompt }) => (
              <button
                key={label}
                onClick={() => { setInput(prompt); if (!prompt) setTimeout(() => textareaRef.current?.focus(), 50); }}
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
            <MessageBubble key={m.id} message={m} onDownloadSVG={downloadSVG} convId={currentConvId} bump={bump} />
          ))}
          {loading && (
            <div className="flex gap-3 max-w-2xl">
              <img src="/ant-skema.png" alt="" className="w-7 h-7 flex-shrink-0 mt-0.5 object-contain animate-spin [animation-duration:1.4s]" />
              <div className="pt-1">
                {loadingSeconds < 3  ? <TypingDots /> :
                 analyzingFile       ? <LoadingText text="Analizando archivo..." /> :
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

      {/* Hidden file inputs */}
      <input ref={cameraInputRef}  type="file" accept="image/*" capture="environment" className="hidden"
        onChange={e => { handleFileSelect(e.target.files?.[0] ?? null); e.target.value = ""; }} />
      <input ref={galleryInputRef} type="file" accept="image/*" className="hidden"
        onChange={e => { handleFileSelect(e.target.files?.[0] ?? null); e.target.value = ""; }} />
      <input ref={fileInputRef}    type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp" className="hidden"
        onChange={e => { handleFileSelect(e.target.files?.[0] ?? null); e.target.value = ""; }} />

      {/* Input bar */}
      <div className="px-3 pt-2" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1.25rem)' }}>
        <div className="max-w-2xl mx-auto">

          {/* Panel de investigación — modal */}
          {investigationMode && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
            <div className="w-full max-w-lg bg-s-bg border border-s-border rounded-2xl p-5 space-y-3 shadow-xl">
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-medium text-s-text flex items-center gap-1.5">
                  <Search size={12} /> Investigación profunda
                </span>
                <button onClick={() => setInvestigationMode(false)} className="text-s-muted hover:text-s-text"><X size={12} /></button>
              </div>
              <input
                placeholder="Tu rol o contexto del proyecto..."
                value={invData.context}
                onChange={e => setInvData(d => ({ ...d, context: e.target.value }))}
                className="w-full text-[13px] bg-s-bg border border-s-border rounded-lg px-3 py-1.5 text-s-text placeholder:text-s-muted focus:outline-none focus:border-s-text"
              />
              <textarea
                placeholder="¿Qué necesitas saber exactamente?"
                autoFocus
                value={invData.query}
                onChange={e => setInvData(d => ({ ...d, query: e.target.value }))}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendInvestigation(); } }}
                className="w-full text-[13px] bg-s-bg border border-s-border rounded-lg px-3 py-1.5 text-s-text placeholder:text-s-muted focus:outline-none focus:border-s-text resize-none"
                rows={2}
              />
              <div className="flex gap-2 items-center">
                <input
                  placeholder="Formato (informe, listado, comparativa...)"
                  value={invData.format}
                  onChange={e => setInvData(d => ({ ...d, format: e.target.value }))}
                  onKeyDown={e => { if (e.key === "Enter") sendInvestigation(); }}
                  className="flex-1 text-[13px] bg-s-bg border border-s-border rounded-lg px-3 py-1.5 text-s-text placeholder:text-s-muted focus:outline-none focus:border-s-text"
                />
                <button
                  onClick={sendInvestigation}
                  disabled={!invData.query.trim() || loading}
                  className="px-4 py-1.5 bg-s-accent text-s-accent-text text-[13px] rounded-lg disabled:opacity-40 hover:opacity-80 transition-opacity"
                >
                  Investigar
                </button>
              </div>
            </div>
            </div>
          )}

          {/* Attachment / search chips */}
          {(attachedFile || searchMode) && (
            <div className="flex flex-wrap items-center gap-2 px-1 mb-2">
              {searchMode && (
                <div className="flex items-center gap-1.5 bg-blue-50 border border-blue-200 text-blue-600 rounded-full px-3 py-1 text-[12px]">
                  <Globe size={11} />
                  <span>Buscar en internet</span>
                  <button onClick={() => setSearchMode(false)} className="ml-0.5 hover:opacity-70"><X size={11} /></button>
                </div>
              )}
              {attachedFile && (
                <div className="flex items-center gap-1.5 bg-s-surface border border-s-border text-s-muted rounded-full px-2 py-1 text-[12px]">
                  {attachedFile.preview
                    ? <img src={attachedFile.preview} className="w-5 h-5 rounded object-cover flex-shrink-0" />
                    : <Paperclip size={11} className="flex-shrink-0" />}
                  <span className="max-w-[160px] truncate">{attachedFile.name}</span>
                  <button onClick={() => setAttachedFile(null)} className="ml-0.5 hover:opacity-70"><X size={11} /></button>
                </div>
              )}
            </div>
          )}

          <div className="flex items-end gap-2">

            {/* + button */}
            <div className="relative flex-shrink-0" ref={attachMenuRef}>
              <button
                onClick={() => setShowAttachMenu(v => !v)}
                className="w-10 h-10 rounded-full bg-s-surface border border-s-border flex items-center justify-center text-s-muted hover:text-s-text hover:border-s-text transition-colors"
                title="Adjuntar"
              >
                <Plus size={18} />
              </button>
              {showAttachMenu && (
                <div className="absolute bottom-full mb-2 left-0 bg-s-surface border border-s-border rounded-xl shadow-lg py-1 min-w-[185px] z-10">
                  <button onClick={() => cameraInputRef.current?.click()}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-[14px] text-s-muted hover:bg-s-bg hover:text-s-text transition-colors">
                    <Camera size={14} /> Cámara
                  </button>
                  <button onClick={() => galleryInputRef.current?.click()}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-[14px] text-s-muted hover:bg-s-bg hover:text-s-text transition-colors">
                    <ImageIcon size={14} /> Galería
                  </button>
                  <button onClick={() => fileInputRef.current?.click()}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-[14px] text-s-muted hover:bg-s-bg hover:text-s-text transition-colors">
                    <Paperclip size={14} /> Archivos
                  </button>
                  <div className="border-t border-s-border my-1" />
                  <button onClick={() => { setSearchMode(true); setShowAttachMenu(false); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-[14px] text-s-muted hover:bg-s-bg hover:text-s-text transition-colors">
                    <Globe size={14} /> Buscar en internet
                  </button>
                  <button onClick={() => { setInvestigationMode(true); setShowAttachMenu(false); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-[14px] text-s-muted hover:bg-s-bg hover:text-s-text transition-colors">
                    <Search size={14} /> Investigación
                  </button>
                </div>
              )}
            </div>

            {/* Textarea */}
            <div className={`flex-1 border border-s-border ${isMultiLine ? "rounded-2xl" : "rounded-full"} bg-s-surface focus-within:border-s-text transition-all px-5 py-3`}>
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

            {(input.trim() || attachedFile) ? (
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

// ── Document card ─────────────────────────────────────────────────────────────

type SaveStep = "idle" | "choosing" | "notes" | "project" | "saved";

function DocumentCard({ message, convId, bump }: {
  message: Message;
  convId: string | null;
  bump: () => void;
}) {
  const [step,       setStep]       = useState<SaveStep>("idle");
  const [titleInput, setTitleInput] = useState("");
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [selectedPid, setSelectedPid] = useState<string | null>(null);
  const [newProjName, setNewProjName] = useState("");
  const [saving,     setSaving]     = useState(false);
  const [savedMsg,   setSavedMsg]   = useState("");

  const content  = message.content;
  const docTitle = extractDocTitle(content);

  const openProject = async () => {
    const projs = await projectsDB.getAll();
    setAllProjects(projs);
    setTitleInput(docTitle);
    setStep("project");
  };

  const openNotes = () => { setTitleInput(docTitle); setStep("notes"); };

  const save = async () => {
    setSaving(true);
    try {
      const t = titleInput.trim() || docTitle;
      const note = await notesDB.create();
      await notesDB.update(note.id, { title: t, content });

      if (step === "project") {
        let pid = selectedPid;
        if (!pid && newProjName.trim()) {
          const p = await projectsDB.create(newProjName.trim());
          pid = p.id;
        }
        if (pid && convId) await convsDB.assignProject(convId, pid);
        const projName = allProjects.find(p => p.id === pid)?.name ?? newProjName.trim();
        setSavedMsg(`Guardado en notas${projName ? ` · Proyecto: ${projName}` : ""}`);
      } else {
        setSavedMsg("Guardado en notas");
      }
      setStep("saved");
      bump();
    } finally {
      setSaving(false);
    }
  };

  const btnBase = "flex items-center gap-1 px-3 py-1.5 rounded-lg border border-s-border text-[12px] text-s-muted hover:text-s-text hover:border-s-text transition-colors";
  const btnPrimary = "px-3 py-1.5 rounded-lg bg-s-text text-s-bg text-[12px] font-medium hover:opacity-80 disabled:opacity-40 transition-opacity";

  return (
    <div className="bg-white rounded-xl border border-s-border shadow-sm overflow-hidden w-full">
      {/* Header */}
      <div className="flex items-center px-4 py-2 bg-s-surface border-b border-s-border">
        <span className="text-[10px] font-semibold text-s-muted uppercase tracking-wider">Documento</span>
      </div>

      {/* Content */}
      <div className="px-8 py-6 text-gray-900 prose prose-sm max-w-none
        prose-headings:text-gray-900 prose-headings:font-bold
        prose-p:text-gray-800 prose-p:my-1.5
        prose-strong:text-gray-900
        prose-li:text-gray-800 prose-li:my-0.5
        prose-table:text-[13px] prose-th:bg-gray-50 prose-th:font-semibold
        prose-hr:border-gray-300">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      </div>

      {/* Action bar */}
      {step !== "saved" && (
        <div className="px-4 py-2.5 border-t border-s-border bg-s-surface flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            <button onClick={() => downloadPDF(content, docTitle)} className={btnBase} title="Descargar PDF">
              <FileDown size={12} /> PDF
            </button>
            <button onClick={() => downloadWord(content, docTitle)} className={btnBase} title="Descargar Word">
              <FileDown size={12} /> Word
            </button>
            {hasTable(content) && (
              <button onClick={() => downloadCSV(content, docTitle)} className={btnBase} title="Exportar tabla a Excel">
                <FileDown size={12} /> Excel
              </button>
            )}
          </div>
          {step === "idle" && (
            <button onClick={() => setStep("choosing")} className={btnBase}>
              Guardar
            </button>
          )}
        </div>
      )}

      {/* ── Save flow ── */}

      {step === "choosing" && (
        <div className="px-4 py-3 border-t border-s-border bg-s-surface flex items-center gap-2 flex-wrap">
          <span className="text-[12px] text-s-muted">¿Dónde guardarlo?</span>
          <button onClick={openNotes}    className={btnPrimary}>Notas</button>
          <button onClick={openProject}  className={btnBase}>Proyecto</button>
          <button onClick={() => setStep("idle")} className="ml-auto text-s-muted hover:text-s-text transition-colors">
            <X size={14} />
          </button>
        </div>
      )}

      {(step === "notes" || step === "project") && (
        <div className="px-4 py-3 border-t border-s-border bg-s-surface space-y-2.5">
          <input
            value={titleInput}
            onChange={e => setTitleInput(e.target.value)}
            placeholder="Título"
            className="w-full bg-s-bg border border-s-border rounded-lg px-3 py-1.5 text-[13px] text-s-text outline-none focus:border-s-text transition-colors"
          />

          {step === "project" && (
            <div className="space-y-2">
              {allProjects.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {allProjects.map(p => (
                    <button key={p.id}
                      onClick={() => { setSelectedPid(p.id === selectedPid ? null : p.id); setNewProjName(""); }}
                      className={`px-2.5 py-1 rounded-lg text-[12px] border transition-colors ${
                        selectedPid === p.id
                          ? "bg-s-text text-s-bg border-s-text"
                          : "border-s-border text-s-muted hover:border-s-text hover:text-s-text"
                      }`}>
                      {p.name}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-s-muted flex-shrink-0">Nuevo proyecto:</span>
                <input
                  value={newProjName}
                  onChange={e => { setNewProjName(e.target.value); setSelectedPid(null); }}
                  placeholder="Nombre"
                  className="flex-1 bg-s-bg border border-s-border rounded-lg px-3 py-1.5 text-[12px] text-s-text outline-none focus:border-s-text transition-colors"
                />
              </div>
            </div>
          )}

          <div className="flex items-center gap-2">
            <button onClick={save} disabled={saving} className={btnPrimary}>
              {saving ? "Guardando..." : "Guardar"}
            </button>
            <button onClick={() => setStep("choosing")} className="text-[12px] text-s-muted hover:text-s-text transition-colors">
              ← Atrás
            </button>
          </div>
        </div>
      )}

      {step === "saved" && (
        <div className="px-4 py-2.5 border-t border-s-border bg-s-surface flex items-center gap-1.5">
          <Check size={13} className="text-green-600" />
          <span className="text-[12px] text-s-muted">{savedMsg}</span>
        </div>
      )}
    </div>
  );
}

// ── Message bubble ─────────────────────────────────────────────────────────────

function MessageBubble({ message: m, onDownloadSVG, convId, bump }: {
  message: Message;
  onDownloadSVG: (svg: string) => void;
  convId: string | null;
  bump: () => void;
}) {
  if (m.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[75%] space-y-1.5">
          {m.attachment && (
            <div className="flex justify-end">
              <div className="flex items-center gap-1.5 bg-s-surface border border-s-border rounded-xl px-3 py-1.5 text-[13px] text-s-muted">
                {m.attachment.mediaType.startsWith("image/") ? <ImageIcon size={13} className="flex-shrink-0" /> :
                 m.attachment.mediaType === "application/pdf"    ? <FileDown   size={13} className="flex-shrink-0" /> :
                 <Paperclip size={13} className="flex-shrink-0" />}
                <span className="max-w-[220px] truncate">{m.attachment.name}</span>
              </div>
            </div>
          )}
          {m.content && (
            <div className="bg-s-surface border border-s-border rounded-2xl px-4 py-3 text-[16px] sm:text-[14px] text-s-text whitespace-pre-wrap">
              {m.content}
            </div>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className="flex gap-3 max-w-2xl">
      <img src="/ant-skema.png" alt="" className="w-7 h-7 flex-shrink-0 mt-0.5 object-contain" />
      <div className="flex-1 space-y-3">
        {m.tool === "document" ? (
          <DocumentCard message={m} convId={convId} bump={bump} />
        ) : (
        <div className="text-[16px] sm:text-[14px] text-s-text leading-relaxed prose prose-sm max-w-none prose-p:my-1 prose-headings:text-s-text prose-strong:text-s-text prose-li:my-0.5">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{ a: ({ href, children }) => (
              <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>
            )}}
          >
            {(m.content ?? "").replace(/\n*<!--SPEC:[\s\S]*?-->/g, "").trim()}
          </ReactMarkdown>
        </div>
        )}
        {m.tool === "agenda" && (
          <div className="flex items-center gap-1.5 text-[12px] text-s-muted">
            <CalendarCheck size={13} /> Añadido a la agenda
          </div>
        )}
        {m.tool === "nota" && (
          <div className="flex items-center gap-1.5 text-[12px] text-s-muted">
            <StickyNote size={13} /> Guardado en notas
          </div>
        )}
        {m.svg && m.floorPlan && (
          <FloorPlanCard svg={m.svg} planId={m.floorPlan.planId} version={m.floorPlan.version} />
        )}
        {m.svg && !m.floorPlan && (
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
