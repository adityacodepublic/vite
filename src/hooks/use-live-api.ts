import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GenAILiveClient } from "@/lib/live/multimodal-live-client";
import { LiveClientOptions } from "@/lib/live/types";
import { AudioStreamer } from "@/lib/live/audio-streamer";
import { audioContext } from "@/lib/live/chat-utils";
import VolMeterWorket from "../lib/worklets/vol-meter";
import {
  LiveClientContextUpdate,
  LiveConnectConfig,
  LiveServerSessionResumptionUpdate,
} from "@google/genai";

export type UseLiveAPIResults = {
  client: GenAILiveClient;
  setConfig: (config: LiveConnectConfig) => void;
  config: LiveConnectConfig;
  model: string;
  setModel: (model: string) => void;
  connected: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  resumeSession: () => Promise<void>;
  sendContextUpdate: (update: LiveClientContextUpdate) => boolean;
  canResume: boolean;
  volume: number;
};

export function useLiveAPI(options: LiveClientOptions): UseLiveAPIResults {
  const client = useMemo(() => new GenAILiveClient(options), [options]);
  const audioStreamerRef = useRef<AudioStreamer | null>(null);
  const pendingAudioChunksRef = useRef<Uint8Array[]>([]);
  const resumeHandleRef = useRef<string | null>(null);
  const resumableRef = useRef(false);
  const lastOutputVolumeRef = useRef(0);
  const lastOutputVolumeUIUpdateRef = useRef(0);

  const [model, setModel] = useState<string>(
    "models/gemini-3.8-live",
  );
  const [config, setConfig] = useState<LiveConnectConfig>({});
  const [connected, setConnected] = useState(false);
  const [canResume, setCanResume] = useState(false);
  const [volume, setVolume] = useState(0);

  const buildConnectConfig = useCallback(
    (resumeHandle?: string | null): LiveConnectConfig => ({
      ...config,
      contextWindowCompression: config.contextWindowCompression ?? {
        slidingWindow: {},
      },
      sessionResumption: {
        ...(config.sessionResumption ?? {}),
        ...(resumeHandle ? { handle: resumeHandle } : {}),
      },
    }),
    [config],
  );

  // register audio for streaming server -> speakers
  useEffect(() => {
    if (!audioStreamerRef.current) {
      audioContext({ id: "audio-out" }).then((audioCtx: AudioContext) => {
        audioStreamerRef.current = new AudioStreamer(audioCtx);
        audioStreamerRef.current
          .addWorklet<any>("vumeter-out", VolMeterWorket, (ev: any) => {
            const nextVolume = Number(ev.data.volume ?? 0);
            const now = performance.now();
            const shouldUpdateUI =
              now - lastOutputVolumeUIUpdateRef.current >= 100 ||
              Math.abs(nextVolume - lastOutputVolumeRef.current) >= 0.02;

            if (shouldUpdateUI) {
              lastOutputVolumeRef.current = nextVolume;
              lastOutputVolumeUIUpdateRef.current = now;
              setVolume(nextVolume);
            }
          })
          .then(() => {
            if (pendingAudioChunksRef.current.length > 0) {
              audioStreamerRef.current?.resume().finally(() => {
                const pending = pendingAudioChunksRef.current.splice(0);
                pending.forEach((chunk) => audioStreamerRef.current?.addPCM16(chunk));
              });
            }
          });
      });
    }
  }, [audioStreamerRef]);

  useEffect(() => {
    const onOpen = () => {
      setConnected(true);
      audioStreamerRef.current?.resume().catch((error) => {
        console.warn("[LiveAPI][audio-out.resume:onOpen] failed", error);
      });
    };

    const onClose = () => {
      setConnected(false);
    };

    const onError = (error: ErrorEvent) => {
      console.error("[LiveAPI][hook.error]", {
        message: error.message,
        filename: error.filename,
        lineno: error.lineno,
        colno: error.colno,
        error: error.error,
      });
    };

    const interruptAudioStreamer = () => audioStreamerRef.current?.interrupt();
    const onSessionResumptionUpdate = (
      update: LiveServerSessionResumptionUpdate,
    ) => {
      resumeHandleRef.current = update.newHandle ?? null;
      resumableRef.current = Boolean(update.resumable);
      const nextCanResume = Boolean(update.resumable && update.newHandle);
      setCanResume((prev) => (prev === nextCanResume ? prev : nextCanResume));
    };

    const onAudio = (data: ArrayBuffer) => {
      const streamer = audioStreamerRef.current;
      if (!streamer) {
        pendingAudioChunksRef.current.push(new Uint8Array(data));
        return;
      }
      if (streamer.context.state === "suspended") {
        streamer.resume().catch((error) => {
          console.warn("[LiveAPI][audio-out.resume:onAudio] failed", error);
        });
      }
      streamer.addPCM16(new Uint8Array(data));
    };

    client
      .on("error", onError)
      .on("open", onOpen)
      .on("close", onClose)
      .on("interrupted", interruptAudioStreamer)
      .on("sessionresumptionupdate", onSessionResumptionUpdate)
      .on("audio", onAudio);

    return () => {
      client
        .off("error", onError)
        .off("open", onOpen)
        .off("close", onClose)
        .off("interrupted", interruptAudioStreamer)
        .off("sessionresumptionupdate", onSessionResumptionUpdate)
        .off("audio", onAudio)
        .disconnect();
    };
  }, [client]);

  const connect = useCallback(async () => {
    if (!config) {
      throw new Error("config has not been set");
    }
    client.disconnect();
    await client.connect(model, buildConnectConfig());
  }, [client, config, model, buildConnectConfig]);

  const disconnect = useCallback(async () => {
    client.disconnect();
    setConnected(false);
  }, [setConnected, client]);

  const resumeSession = useCallback(async () => {
    if (!resumableRef.current || !resumeHandleRef.current) {
      return;
    }

    client.disconnect();
    const connected = await client.connect(
      model,
      buildConnectConfig(resumeHandleRef.current),
    );

    if (!connected) {
      resumeHandleRef.current = null;
      resumableRef.current = false;
      setCanResume(false);
    }
  }, [client, model, buildConnectConfig]);

  const sendContextUpdate = useCallback(
    (update: LiveClientContextUpdate) => {
      return client.sendContextUpdate(update);
    },
    [client],
  );

  return useMemo(
    () => ({
      client,
      config,
      setConfig,
      model,
      setModel,
      connected,
      connect,
      disconnect,
      resumeSession,
      sendContextUpdate,
      canResume,
      volume,
    }),
    [
      client,
      config,
      setConfig,
      model,
      setModel,
      connected,
      connect,
      disconnect,
      resumeSession,
      sendContextUpdate,
      canResume,
      volume,
    ],
  );
}
