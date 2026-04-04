import { GoogleGenAI, type LiveServerMessage, Modality } from "@google/genai";
import { readFile } from "node:fs/promises";

const API_KEY = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
if (!API_KEY) {
  throw new Error("Set VITE_GEMINI_API_KEY or GEMINI_API_KEY");
}

const MODEL = "models/gemini-3.1-flash-live-preview";
const FRAME_PATH = process.argv[2] || "public/logo192.png";
const RUNS = Number(process.argv[3] || "2");
const VIDEO_FPS = Number(process.argv[4] || "1");
const VIDEO_DURATION_MS = Number(process.argv[5] || "8000");
const AUDIO_DURATION_MS = Number(process.argv[6] || "8000");
const AUDIO_CHUNK_MS = Number(process.argv[7] || "100");
const AUDIO_SAMPLE_RATE = 16_000;

type TestResult = {
  mode: "sequential" | "concurrent";
  run: number;
  closeCode: number | null;
  closeReason: string;
  wasClean: boolean | null;
  serverMessages: number;
  serverContents: number;
  errors: number;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function makeSinePcm16(durationMs: number, sampleRate: number): Int16Array {
  const totalSamples = Math.floor((durationMs / 1000) * sampleRate);
  const out = new Int16Array(totalSamples);
  const hz = 440;
  const amplitude = 0.25;

  for (let i = 0; i < totalSamples; i += 1) {
    const t = i / sampleRate;
    const sample = Math.sin(2 * Math.PI * hz * t) * amplitude;
    out[i] = Math.max(-1, Math.min(1, sample)) * 32767;
  }

  return out;
}

function chunkPcm(pcm: Int16Array, chunkMs: number, sampleRate: number): Int16Array[] {
  const samplesPerChunk = Math.max(1, Math.floor((chunkMs / 1000) * sampleRate));
  const chunks: Int16Array[] = [];

  for (let start = 0; start < pcm.length; start += samplesPerChunk) {
    const end = Math.min(pcm.length, start + samplesPerChunk);
    chunks.push(pcm.subarray(start, end));
  }

  return chunks;
}

async function runOne(
  ai: GoogleGenAI,
  mode: "sequential" | "concurrent",
  run: number,
  frameB64: string,
  audioChunks: Int16Array[],
): Promise<TestResult> {
  let closeCode: number | null = null;
  let closeReason = "";
  let wasClean: boolean | null = null;
  let serverMessages = 0;
  let serverContents = 0;
  let errors = 0;

  const session = await ai.live.connect({
    model: MODEL,
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: "Aoede" },
        },
      },
    },
    callbacks: {
      onopen: () => {
        console.log(`[${mode}#${run}] open`);
      },
      onmessage: (msg: LiveServerMessage) => {
        serverMessages += 1;
        if (msg.serverContent) {
          serverContents += 1;
        }
      },
      onerror: (event: unknown) => {
        errors += 1;
        console.error(`[${mode}#${run}] error`, event);
      },
      onclose: (event: { code?: number; reason?: string; wasClean?: boolean }) => {
        closeCode = event.code ?? null;
        closeReason = event.reason ?? "";
        wasClean = event.wasClean ?? null;
        console.error(
          `[${mode}#${run}] close code=${String(event.code)} clean=${String(event.wasClean)} reason=${event.reason ?? ""}`,
        );
      },
    },
  });

  session.sendRealtimeInput({ text: "Acknowledge with one short sentence." });

  const frameIntervalMs = Math.floor(1000 / VIDEO_FPS);
  const frameCount = Math.max(1, Math.floor(VIDEO_DURATION_MS / frameIntervalMs));

  const sendVideoFrames = async () => {
    for (let i = 0; i < frameCount; i += 1) {
      session.sendRealtimeInput({
        video: {
          mimeType: "image/png",
          data: frameB64,
        },
      });
      await sleep(frameIntervalMs);
    }
  };

  const sendAudio = async () => {
    for (const chunk of audioChunks) {
      const data = Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength).toString(
        "base64",
      );
      session.sendRealtimeInput({
        audio: {
          mimeType: `audio/pcm;rate=${AUDIO_SAMPLE_RATE}`,
          data,
        },
      });
      await sleep(AUDIO_CHUNK_MS);
    }
    session.sendRealtimeInput({ audioStreamEnd: true });
  };

  if (mode === "sequential") {
    await sendVideoFrames();
    await sendAudio();
  } else {
    await Promise.all([sendVideoFrames(), sendAudio()]);
  }

  await sleep(5_000);
  session.close();
  await sleep(500);

  return {
    mode,
    run,
    closeCode,
    closeReason,
    wasClean,
    serverMessages,
    serverContents,
    errors,
  };
}

const frameBytes = await readFile(FRAME_PATH);
const frameB64 = Buffer.from(frameBytes).toString("base64");
const pcm = makeSinePcm16(AUDIO_DURATION_MS, AUDIO_SAMPLE_RATE);
const audioChunks = chunkPcm(pcm, AUDIO_CHUNK_MS, AUDIO_SAMPLE_RATE);

const ai = new GoogleGenAI({ apiKey: API_KEY });
const results: TestResult[] = [];

for (let run = 1; run <= RUNS; run += 1) {
  results.push(await runOne(ai, "sequential", run, frameB64, audioChunks));
  results.push(await runOne(ai, "concurrent", run, frameB64, audioChunks));
}

const summarize = (mode: "sequential" | "concurrent") => {
  const list = results.filter((r) => r.mode === mode);
  const ok = list.filter((r) => r.closeCode === 1000 || r.closeCode === null).length;
  const invalid = list.filter((r) => r.closeCode === 1007).length;
  const internal = list.filter((r) => r.closeCode === 1011).length;
  const other = list.length - ok - invalid - internal;
  const avgMessages =
    list.reduce((sum, item) => sum + item.serverMessages, 0) / Math.max(1, list.length);

  return {
    mode,
    runs: list.length,
    ok,
    invalid1007: invalid,
    internal1011: internal,
    other,
    avgServerMessages: Number(avgMessages.toFixed(1)),
  };
};

console.log("\n=== Detailed Results ===");
for (const item of results) {
  console.log(JSON.stringify(item));
}

console.log("\n=== Summary ===");
console.log(JSON.stringify(summarize("sequential"), null, 2));
console.log(JSON.stringify(summarize("concurrent"), null, 2));
