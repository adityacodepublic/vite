import { GenAILiveClient } from "@/lib/live/multimodal-live-client";

const AUDIO_TARGET_RATE = 16_000;

type StreamCallbacks = {
  onProgress?: (progress: number) => void;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForEvent = (target: EventTarget, name: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const onSuccess = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error(`${name} failed`));
    };
    const cleanup = () => {
      target.removeEventListener(name, onSuccess as EventListener);
      target.removeEventListener("error", onError as EventListener);
    };

    target.addEventListener(name, onSuccess as EventListener, { once: true });
    target.addEventListener("error", onError as EventListener, { once: true });
  });

const fileToBase64 = async (file: File): Promise<string> => {
  const buffer = await file.arrayBuffer();
  return arrayBufferToBase64(buffer);
};

const arrayBufferToBase64 = (buffer: ArrayBufferLike): string => {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
};

const getMediaDuration = async (file: File, type: "audio" | "video") => {
  const url = URL.createObjectURL(file);
  const media = document.createElement(type);
  media.preload = "metadata";
  media.src = url;

  try {
    await waitForEvent(media, "loadedmetadata");
    const duration = Number(media.duration || 0);
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new Error(`Could not read ${type} duration.`);
    }
    return duration;
  } finally {
    URL.revokeObjectURL(url);
  }
};

const resampleTo16kMonoPcm = (audioBuffer: AudioBuffer): Int16Array => {
  const sourceRate = audioBuffer.sampleRate;
  const sourceLength = audioBuffer.length;
  const channels = audioBuffer.numberOfChannels;

  const mono = new Float32Array(sourceLength);
  for (let ch = 0; ch < channels; ch += 1) {
    const channel = audioBuffer.getChannelData(ch);
    for (let i = 0; i < sourceLength; i += 1) {
      mono[i] += channel[i] / channels;
    }
  }

  const targetLength = Math.max(1, Math.round((sourceLength * AUDIO_TARGET_RATE) / sourceRate));
  const out = new Int16Array(targetLength);

  for (let i = 0; i < targetLength; i += 1) {
    const sourcePos = (i * sourceRate) / AUDIO_TARGET_RATE;
    const left = Math.floor(sourcePos);
    const right = Math.min(sourceLength - 1, left + 1);
    const mix = sourcePos - left;
    const sample = mono[left] + (mono[right] - mono[left]) * mix;
    const clamped = Math.max(-1, Math.min(1, sample));
    out[i] = clamped < 0 ? clamped * 32768 : clamped * 32767;
  }

  return out;
};

export async function streamImageFile(
  file: File,
  mimeType: string,
  client: GenAILiveClient,
  callbacks?: StreamCallbacks,
): Promise<void> {
  callbacks?.onProgress?.(0);
  const data = await fileToBase64(file);
  client.sendRealtimeInput([{ mimeType, data }]);
  callbacks?.onProgress?.(1);
}

export async function streamVideoFile(
  file: File,
  mimeType: string,
  client: GenAILiveClient,
  options: { maxDurationSec: number; turbo: number; sampleFps?: number },
  callbacks?: StreamCallbacks,
): Promise<void> {
  const sampleFps = options.sampleFps ?? 1;
  const durationSec = await getMediaDuration(file, "video");

  if (durationSec > options.maxDurationSec) {
    throw new Error(`Video exceeds ${options.maxDurationSec}s limit (${durationSec.toFixed(1)}s).`);
  }

  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.preload = "auto";
  video.muted = true;
  video.src = url;

  const canvas = document.createElement("canvas");

  try {
    await waitForEvent(video, "loadedmetadata");

    const width = Math.max(1, Math.floor(video.videoWidth * 0.25));
    const height = Math.max(1, Math.floor(video.videoHeight * 0.25));
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Could not create video frame canvas context.");
    }

    const frameCount = Math.max(1, Math.floor(durationSec * sampleFps));
    const stepSec = durationSec / frameCount;
    const sendIntervalMs = Math.max(40, Math.floor(1000 / (sampleFps * options.turbo)));

    for (let i = 0; i < frameCount; i += 1) {
      const nextTime = Math.min(durationSec - 0.001, i * stepSec);
      video.currentTime = Math.max(0, nextTime);
      await waitForEvent(video, "seeked");

      ctx.drawImage(video, 0, 0, width, height);
      const frameBase64 = canvas.toDataURL(mimeType.includes("png") ? "image/png" : "image/jpeg", 0.9);
      const data = frameBase64.slice(frameBase64.indexOf(",") + 1);
      client.sendRealtimeInput([{ mimeType: "image/jpeg", data }]);
      callbacks?.onProgress?.((i + 1) / frameCount);
      await sleep(sendIntervalMs);
    }
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function streamAudioFile(
  file: File,
  client: GenAILiveClient,
  options: { maxDurationSec: number; turbo: number; chunkMs?: number },
  callbacks?: StreamCallbacks,
): Promise<void> {
  const durationSec = await getMediaDuration(file, "audio");
  if (durationSec > options.maxDurationSec) {
    throw new Error(`Audio exceeds ${options.maxDurationSec}s limit (${durationSec.toFixed(1)}s).`);
  }

  const context = new AudioContext();
  try {
    const arrayBuffer = await file.arrayBuffer();
    const decoded = await context.decodeAudioData(arrayBuffer.slice(0));
    const pcm = resampleTo16kMonoPcm(decoded);
    const chunkMs = options.chunkMs ?? 100;
    const samplesPerChunk = Math.max(1, Math.floor((chunkMs / 1000) * AUDIO_TARGET_RATE));
    const sleepMs = Math.max(8, Math.floor(chunkMs / options.turbo));
    const totalChunks = Math.max(1, Math.ceil(pcm.length / samplesPerChunk));
    let sentChunks = 0;

    for (let start = 0; start < pcm.length; start += samplesPerChunk) {
      const end = Math.min(pcm.length, start + samplesPerChunk);
      const chunk = pcm.subarray(start, end);
      const data = arrayBufferToBase64(
        chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength),
      );
      client.sendRealtimeInput([{ mimeType: "audio/pcm;rate=16000", data }]);
      sentChunks += 1;
      callbacks?.onProgress?.(sentChunks / totalChunks);
      await sleep(sleepMs);
    }

    client.sendAudioStreamEnd();
  } finally {
    await context.close();
  }
}
