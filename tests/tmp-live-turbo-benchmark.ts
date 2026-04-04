import { GoogleGenAI, type LiveServerMessage, Modality } from "@google/genai";
import { readFile } from "node:fs/promises";

const API_KEY = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
if (!API_KEY) {
  throw new Error("Set VITE_GEMINI_API_KEY or GEMINI_API_KEY");
}

const MODEL = "models/gemini-3.1-flash-live-preview";
const FRAME_PATH = process.argv[2] || "public/logo192.png";
const REPEATS = Number(process.argv[3] || "3");

const VIDEO_DURATION_MS = 15_000;
const AUDIO_DURATION_MS = 15_000;
const AUDIO_SAMPLE_RATE = 16_000;
const BASE_VIDEO_FPS = 1;
const BASE_AUDIO_CHUNK_MS = 100;

type Scenario =
  | "audio_only"
  | "video_only"
  | "seq_video_audio"
  | "seq_video_audio_with_bg";

type BenchResult = {
  speed: number;
  scenario: Scenario;
  run: number;
  closeCode: number | null;
  closeReason: string;
  wasClean: boolean | null;
  errors: number;
  serverMessages: number;
  elapsedMs: number;
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

const toB64 = (pcmChunk: Int16Array): string =>
  Buffer.from(pcmChunk.buffer, pcmChunk.byteOffset, pcmChunk.byteLength).toString(
    "base64",
  );

async function runScenario(
  ai: GoogleGenAI,
  speed: number,
  scenario: Scenario,
  run: number,
  frameB64: string,
  audioChunks: Int16Array[],
): Promise<BenchResult> {
  let closeCode: number | null = null;
  let closeReason = "";
  let wasClean: boolean | null = null;
  let errors = 0;
  let serverMessages = 0;

  const frameIntervalMs = Math.max(40, Math.floor((1000 / BASE_VIDEO_FPS) / speed));
  const audioChunkSleepMs = Math.max(10, Math.floor(BASE_AUDIO_CHUNK_MS / speed));
  const videoFrameCount = Math.max(
    1,
    Math.floor((VIDEO_DURATION_MS / 1000) * BASE_VIDEO_FPS),
  );

  const session = await ai.live.connect({
    model: MODEL,
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } },
      },
    },
    callbacks: {
      onopen: () => {
        console.log(`[${scenario}][${speed}x][#${run}] open`);
      },
      onmessage: (_msg: LiveServerMessage) => {
        serverMessages += 1;
      },
      onerror: (event: unknown) => {
        errors += 1;
        console.error(`[${scenario}][${speed}x][#${run}] error`, event);
      },
      onclose: (event: { code?: number; reason?: string; wasClean?: boolean }) => {
        closeCode = event.code ?? null;
        closeReason = event.reason ?? "";
        wasClean = event.wasClean ?? null;
        console.error(
          `[${scenario}][${speed}x][#${run}] close code=${String(event.code)} clean=${String(event.wasClean)} reason=${event.reason ?? ""}`,
        );
      },
    },
  });

  session.sendRealtimeInput({ text: "Acknowledge with one short sentence." });

  const sendAudio = async (chunks: Int16Array[], sleepMs: number, endStream: boolean) => {
    for (const chunk of chunks) {
      session.sendRealtimeInput({
        audio: {
          mimeType: `audio/pcm;rate=${AUDIO_SAMPLE_RATE}`,
          data: toB64(chunk),
        },
      });
      await sleep(sleepMs);
    }
    if (endStream) {
      session.sendRealtimeInput({ audioStreamEnd: true });
    }
  };

  const sendVideoFrames = async (frames: number, sleepMs: number) => {
    for (let i = 0; i < frames; i += 1) {
      session.sendRealtimeInput({
        video: {
          mimeType: "image/png",
          data: frameB64,
        },
      });
      await sleep(sleepMs);
    }
  };

  const bgTask = async () => {
    const bgEndAt = Date.now() + VIDEO_DURATION_MS;
    while (Date.now() < bgEndAt) {
      session.sendRealtimeInput({
        audio: {
          mimeType: `audio/pcm;rate=${AUDIO_SAMPLE_RATE}`,
          data: toB64(audioChunks[0]),
        },
      });
      session.sendRealtimeInput({
        video: {
          mimeType: "image/png",
          data: frameB64,
        },
      });
      await sleep(300);
    }
  };

  const startedAt = Date.now();

  if (scenario === "audio_only") {
    await sendAudio(audioChunks, audioChunkSleepMs, true);
  } else if (scenario === "video_only") {
    await sendVideoFrames(videoFrameCount, frameIntervalMs);
  } else if (scenario === "seq_video_audio") {
    await sendVideoFrames(videoFrameCount, frameIntervalMs);
    await sendAudio(audioChunks, audioChunkSleepMs, true);
  } else {
    await Promise.all([
      (async () => {
        await sendVideoFrames(videoFrameCount, frameIntervalMs);
        await sendAudio(audioChunks, audioChunkSleepMs, true);
      })(),
      bgTask(),
    ]);
  }

  await sleep(4_000);
  session.close();
  await sleep(500);

  return {
    speed,
    scenario,
    run,
    closeCode,
    closeReason,
    wasClean,
    errors,
    serverMessages,
    elapsedMs: Date.now() - startedAt,
  };
}

const frameBytes = await readFile(FRAME_PATH);
const frameB64 = Buffer.from(frameBytes).toString("base64");
const audioPcm = makeSinePcm16(AUDIO_DURATION_MS, AUDIO_SAMPLE_RATE);
const audioChunks = chunkPcm(audioPcm, BASE_AUDIO_CHUNK_MS, AUDIO_SAMPLE_RATE);

const ai = new GoogleGenAI({ apiKey: API_KEY });
const speeds = [2, 3, 4];
const scenarios: Scenario[] = [
  "audio_only",
  "video_only",
  "seq_video_audio",
  "seq_video_audio_with_bg",
];

const results: BenchResult[] = [];

for (const speed of speeds) {
  for (const scenario of scenarios) {
    for (let run = 1; run <= REPEATS; run += 1) {
      const result = await runScenario(ai, speed, scenario, run, frameB64, audioChunks);
      results.push(result);
    }
  }
}

const summarize = (speed: number, scenario: Scenario) => {
  const list = results.filter((r) => r.speed === speed && r.scenario === scenario);
  const ok = list.filter((r) => r.closeCode === 1000 || r.closeCode === null).length;
  const invalid = list.filter((r) => r.closeCode === 1007).length;
  const internal = list.filter((r) => r.closeCode === 1011).length;
  const avgMs =
    list.reduce((sum, item) => sum + item.elapsedMs, 0) / Math.max(1, list.length);
  return {
    speed,
    scenario,
    runs: list.length,
    ok,
    invalid1007: invalid,
    internal1011: internal,
    other: list.length - ok - invalid - internal,
    avgElapsedMs: Math.round(avgMs),
  };
};

console.log("\n=== Detailed Results ===");
for (const item of results) {
  console.log(JSON.stringify(item));
}

console.log("\n=== Summary ===");
for (const speed of speeds) {
  for (const scenario of scenarios) {
    console.log(JSON.stringify(summarize(speed, scenario), null, 2));
  }
}
