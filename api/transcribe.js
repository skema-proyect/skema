import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { audioBase64, mimeType = "audio/webm", docType = "nota" } = req.body;
  if (!audioBase64) return res.status(400).json({ error: "No se recibió audio" });

  try {
    const buffer = Buffer.from(audioBase64, "base64");
    const file   = new File([buffer], "recording.webm", { type: mimeType });

    const transcription = await openai.audio.transcriptions.create({
      file,
      model:    "whisper-1",
      language: "es",
    });

    res.json({ transcript: transcription.text, docType });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
