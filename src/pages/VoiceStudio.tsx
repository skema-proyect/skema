import { useState, useRef } from "react";
import { Mic, MicOff, FileText, Download, Loader2 } from "lucide-react";

type Stage = "idle" | "recording" | "transcribing" | "generating" | "done";

export default function VoiceStudio() {
  const [stage,      setStage]      = useState<Stage>("idle");
  const [transcript, setTranscript] = useState("");
  const [document,   setDocument]   = useState("");
  const [docType,    setDocType]    = useState("informe");
  const mediaRef  = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const startRecording = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
    chunksRef.current = [];
    recorder.ondataavailable = e => chunksRef.current.push(e.data);
    recorder.onstop = handleStop;
    recorder.start();
    mediaRef.current = recorder;
    setStage("recording");
  };

  const stopRecording = () => {
    mediaRef.current?.stop();
    mediaRef.current?.stream.getTracks().forEach(t => t.stop());
  };

  const handleStop = async () => {
    setStage("transcribing");
    const blob       = new Blob(chunksRef.current, { type: "audio/webm" });
    const arrayBuf   = await blob.arrayBuffer();
    const uint8      = new Uint8Array(arrayBuf);
    const audioBase64 = btoa(String.fromCharCode(...uint8));

    try {
      const res  = await fetch("/api/transcribe", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ audioBase64, mimeType: "audio/webm", docType }),
      });
      const data = await res.json();
      setTranscript(data.transcript ?? "");
      setStage("generating");

      const res2  = await fetch("/api/document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: data.transcript, docType }),
      });
      const data2 = await res2.json();
      setDocument(data2.content ?? "");
      setStage("done");
    } catch {
      setStage("idle");
    }
  };

  const docTypes = [
    { value: "informe",  label: "Informe de visita"  },
    { value: "acta",     label: "Acta de reunión"    },
    { value: "nota",     label: "Nota interna"       },
    { value: "resumen",  label: "Resumen ejecutivo"  },
  ];

  return (
    <div className="px-8 py-10 max-w-4xl mx-auto">
      <h1 className="text-skema-text font-inter text-xl font-light mb-1">Estudio de Voz</h1>
      <p className="text-skema-muted text-[13px] mb-8">
        Graba una nota, reunión o visita — SKEMA genera el documento profesional.
      </p>

      {/* Tipo de documento */}
      <div className="bg-skema-surface border border-skema-border rounded-xl p-6 mb-5">
        <p className="text-skema-muted text-[11px] tracking-wider uppercase mb-3">Tipo de documento</p>
        <div className="flex flex-wrap gap-2">
          {docTypes.map(t => (
            <button
              key={t.value}
              onClick={() => setDocType(t.value)}
              className={`px-4 py-2 rounded-lg font-inter text-[12px] border transition-colors ${
                docType === t.value
                  ? "bg-skema-accent text-white border-skema-accent"
                  : "border-skema-border text-skema-muted hover:border-skema-accent/40 hover:text-skema-text"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Grabación */}
      <div className="bg-skema-surface border border-skema-border rounded-xl p-8 flex flex-col items-center gap-5 mb-5">
        {stage === "idle" && (
          <>
            <button
              onClick={startRecording}
              className="w-20 h-20 rounded-full bg-skema-accent hover:bg-skema-accent-dark flex items-center justify-center transition-colors shadow-lg shadow-skema-accent/20"
            >
              <Mic size={32} className="text-white" />
            </button>
            <p className="text-skema-muted text-[13px]">Pulsa para empezar a grabar</p>
          </>
        )}

        {stage === "recording" && (
          <>
            <button
              onClick={stopRecording}
              className="w-20 h-20 rounded-full bg-skema-danger flex items-center justify-center animate-pulse"
            >
              <MicOff size={32} className="text-white" />
            </button>
            <p className="text-skema-text text-[13px]">Grabando... pulsa para detener</p>
          </>
        )}

        {(stage === "transcribing" || stage === "generating") && (
          <>
            <Loader2 size={40} className="text-skema-accent animate-spin" />
            <p className="text-skema-muted text-[13px]">
              {stage === "transcribing" ? "Transcribiendo audio..." : "Generando documento..."}
            </p>
          </>
        )}

        {stage === "done" && (
          <p className="text-skema-success text-[13px]">Documento generado correctamente</p>
        )}
      </div>

      {/* Transcripción */}
      {transcript && (
        <div className="bg-skema-surface border border-skema-border rounded-xl p-6 mb-5">
          <p className="text-skema-muted text-[11px] tracking-wider uppercase mb-3">Transcripción</p>
          <p className="text-skema-text text-[13px] leading-relaxed whitespace-pre-wrap">{transcript}</p>
        </div>
      )}

      {/* Documento generado */}
      {document && (
        <div className="bg-skema-surface border border-skema-border rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <FileText size={15} className="text-skema-accent" />
              <p className="text-skema-muted text-[11px] tracking-wider uppercase">Documento generado</p>
            </div>
            <button
              className="flex items-center gap-2 text-skema-muted hover:text-skema-text text-[12px] font-inter transition-colors"
            >
              <Download size={14} />
              Exportar PDF
            </button>
          </div>
          <div className="text-skema-text text-[13px] leading-relaxed whitespace-pre-wrap border-t border-skema-border pt-4">
            {document}
          </div>
        </div>
      )}
    </div>
  );
}
