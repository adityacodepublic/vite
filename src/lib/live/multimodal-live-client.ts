import {
  Content,
  GoogleGenAI,
  LiveCallbacks,
  LiveClientToolResponse,
  LiveConnectConfig,
  LiveServerContent,
  LiveServerMessage,
  LiveServerSessionResumptionUpdate,
  LiveServerToolCall,
  LiveServerToolCallCancellation,
  Part,
  Session,
} from "@google/genai";

import { EventEmitter } from "eventemitter3";
import { difference } from "lodash";
import {
  EphemeralTokenResponse,
  LiveClientOptions,
  StreamingLog,
} from "./types";
import { base64ToArrayBuffer } from "./chat-utils";

const TOKEN_REFRESH_BUFFER_MS = 2 * 60 * 1000;
const TOKEN_REFRESH_FALLBACK_MS = 25 * 60 * 1000;
const RECONNECT_BACKOFF_MAX_MS = 15_000;
const GO_AWAY_RECONNECT_BUFFER_MS = 1000;

/**
 * Event types that can be emitted by the MultimodalLiveClient.
 * Each event corresponds to a specific message from GenAI or client state change.
 */
export interface LiveClientEventTypes {
  // Emitted when audio data is received
  audio: (data: ArrayBuffer) => void;
  // Emitted when the connection closes
  close: (event: CloseEvent) => void;
  // Emitted when content is received from the server
  content: (data: LiveServerContent) => void;
  // Emitted when an error occurs
  error: (error: ErrorEvent) => void;
  // Emitted when the server interrupts the current generation
  interrupted: () => void;
  // Emitted for logging events
  log: (log: StreamingLog) => void;
  // Emitted when the connection opens
  open: () => void;
  // Emitted when the initial setup is complete
  setupcomplete: () => void;
  // Emitted when a tool call is received
  toolcall: (toolCall: LiveServerToolCall) => void;
  // Emitted when a tool call is cancelled
  toolcallcancellation: (
    toolcallCancellation: LiveServerToolCallCancellation,
  ) => void;
  // Emitted when the current turn is complete
  turncomplete: () => void;
  // Emitted when session resumption state is updated
  sessionresumptionupdate: (update: LiveServerSessionResumptionUpdate) => void;
}

/**
 * A event-emitting class that manages the connection to the websocket and emits
 * events to the rest of the application.
 * If you dont want to use react you can still use this.
 */
export class GenAILiveClient extends EventEmitter<LiveClientEventTypes> {
  protected client: GoogleGenAI;
  private options: LiveClientOptions;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private manualDisconnect = false;
  private reconnectAttempts = 0;
  private reconnecting = false;
  private suppressCloseRecovery = false;
  private lastResumptionHandle: string | null = null;
  private lastResumable = false;
  private lastTokenMetadata: {
    expireAtMs?: number;
    newSessionExpireAtMs?: number;
  } | null = null;
  private lastConnectConfig: LiveConnectConfig | null = null;

  private _status: "connected" | "disconnected" | "connecting" = "disconnected";
  public get status() {
    return this._status;
  }

  private _session: Session | null = null;
  public get session() {
    return this._session;
  }

  private _model: string | null = null;
  public get model() {
    return this._model;
  }

  protected config: LiveConnectConfig | null = null;

  public getConfig() {
    return { ...this.config };
  }

  constructor(options: LiveClientOptions) {
    super();
    this.options = options;
    this.client = this.createClient(options.apiKey ?? "");
    this.onopen = this.onopen.bind(this);
    this.onerror = this.onerror.bind(this);
    this.onclose = this.onclose.bind(this);
    this.onmessage = this.onmessage.bind(this);
  }

  private createClient(apiKey: string): GoogleGenAI {
    const { getEphemeralToken, ...baseOptions } = this.options;
    void getEphemeralToken;
    return new GoogleGenAI({
      ...baseOptions,
      apiKey,
      apiVersion: baseOptions.apiVersion ?? "v1alpha",
    });
  }

  private clearTimers() {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private parseDurationMs(duration?: string): number | null {
    if (!duration) {
      return null;
    }
    const match = duration.match(/^(-?\d+(?:\.\d+)?)s$/);
    if (!match) {
      return null;
    }
    const seconds = Number(match[1]);
    if (!Number.isFinite(seconds)) {
      return null;
    }
    return Math.max(0, Math.floor(seconds * 1000));
  }

  private scheduleTokenRefresh() {
    if (this.manualDisconnect) {
      return;
    }

    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }

    const expireAtMs = this.lastTokenMetadata?.expireAtMs;
    const now = Date.now();
    let delayMs = TOKEN_REFRESH_FALLBACK_MS;

    if (expireAtMs) {
      delayMs = Math.max(30_000, expireAtMs - TOKEN_REFRESH_BUFFER_MS - now);
    }

    this.refreshTimer = setTimeout(() => {
      void this.reconnectWithResumption("token-refresh");
    }, delayMs);

    this.log(
      "client.tokenRefreshScheduled",
      `next refresh in ${Math.round(delayMs / 1000)}s`,
    );
  }

  private scheduleReconnect(reason: string) {
    if (this.manualDisconnect || this.reconnecting) {
      return;
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    const delay = Math.min(
      1000 * Math.pow(2, this.reconnectAttempts),
      RECONNECT_BACKOFF_MAX_MS,
    );
    this.reconnectAttempts += 1;

    this.log("client.reconnectScheduled", `${reason} retry in ${delay}ms`);

    this.reconnectTimer = setTimeout(() => {
      void this.reconnectWithResumption("auto-reconnect");
    }, delay);
  }

  private scheduleReconnectSoon(delayMs: number, reason: string) {
    if (this.manualDisconnect || this.reconnecting) {
      return;
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    const safeDelay = Math.max(0, delayMs);
    this.log("client.reconnectScheduled", `${reason} retry in ${safeDelay}ms`);
    this.reconnectTimer = setTimeout(() => {
      void this.reconnectWithResumption(reason);
    }, safeDelay);
  }

  private parseTokenResult(tokenResult: string | EphemeralTokenResponse): {
    token: string;
    metadata: { expireAtMs?: number; newSessionExpireAtMs?: number };
  } {
    if (typeof tokenResult === "string") {
      return { token: tokenResult, metadata: {} };
    }

    return {
      token: tokenResult.token,
      metadata: {
        expireAtMs: tokenResult.expireTime
          ? new Date(tokenResult.expireTime).getTime()
          : undefined,
        newSessionExpireAtMs: tokenResult.newSessionExpireTime
          ? new Date(tokenResult.newSessionExpireTime).getTime()
          : undefined,
      },
    };
  }

  private async resolveApiKey(): Promise<string> {
    if (typeof this.options.getEphemeralToken === "function") {
      const tokenResult = await this.options.getEphemeralToken();
      const { token, metadata } = this.parseTokenResult(tokenResult);
      this.lastTokenMetadata = metadata;
      if (!token) {
        throw new Error("Token endpoint returned an empty token");
      }
      return token;
    }

    if (this.options.apiKey) {
      return this.options.apiKey;
    }

    throw new Error("No API key or ephemeral token provider configured");
  }

  protected log(type: string, message: StreamingLog["message"]) {
    const log: StreamingLog = {
      date: new Date(),
      type,
      message,
    };
    if (
      type === "client.open" ||
      type === "client.close" ||
      type === "server.close" ||
      type === "server.error" ||
      type === "server.goAway"
    ) {
      console.log(`[LiveAPI] ${type}`, message);
    }
    this.emit("log", log);
  }

  async connect(model: string, config: LiveConnectConfig): Promise<boolean> {
    if (this._status === "connected" || this._status === "connecting") {
      return false;
    }

    const normalizedModel = model.replace(/^models\//, "");

    this.manualDisconnect = false;
    this.clearTimers();
    this._status = "connecting";
    this.config = config;
    this.lastConnectConfig = { ...config };
    this._model = normalizedModel;

    try {
      const apiKey = await this.resolveApiKey();
      this.client = this.createClient(apiKey);
    } catch (e) {
      console.error("Error resolving GenAI credentials:", e);
      this._status = "disconnected";
      return false;
    }

    const callbacks: LiveCallbacks = {
      onopen: this.onopen,
      onmessage: this.onmessage,
      onerror: this.onerror,
      onclose: this.onclose,
    };

    try {
      this._session = await this.client.live.connect({
        model: normalizedModel,
        config,
        callbacks,
      });
    } catch (e) {
      console.error("Error connecting to GenAI Live:", e);
      this._status = "disconnected";
      return false;
    }

    this._status = "connected";
    this.reconnectAttempts = 0;
    this.scheduleTokenRefresh();
    return true;
  }

  private buildResumeConfig(): LiveConnectConfig | null {
    if (!this.lastConnectConfig) {
      return null;
    }

    if (!this.lastResumable || !this.lastResumptionHandle) {
      return {
        ...this.lastConnectConfig,
        sessionResumption: {
          ...(this.lastConnectConfig.sessionResumption ?? {}),
        },
      };
    }

    return {
      ...this.lastConnectConfig,
      sessionResumption: {
        ...(this.lastConnectConfig.sessionResumption ?? {}),
        handle: this.lastResumptionHandle,
      },
    };
  }

  private buildFreshConfig(): LiveConnectConfig | null {
    if (!this.lastConnectConfig) {
      return null;
    }
    return {
      ...this.lastConnectConfig,
      sessionResumption: {
        ...(this.lastConnectConfig.sessionResumption ?? {}),
      },
    };
  }

  private async reconnectWithResumption(reason: string): Promise<boolean> {
    if (this.reconnecting || this.manualDisconnect) {
      return false;
    }

    if (!this._model || !this.lastConnectConfig) {
      return false;
    }

    const resumeConfig = this.buildResumeConfig();
    if (!resumeConfig) {
      return false;
    }

    this.reconnecting = true;
    this._status = "connecting";
    this.clearTimers();
    this.log("client.reconnect", reason);

    try {
      const apiKey = await this.resolveApiKey();
      this.client = this.createClient(apiKey);

      this.suppressCloseRecovery = true;
      this._session?.close();
      this._session = null;

      const callbacks: LiveCallbacks = {
        onopen: this.onopen,
        onmessage: this.onmessage,
        onerror: this.onerror,
        onclose: this.onclose,
      };

      this._session = await this.client.live.connect({
        model: this._model,
        config: resumeConfig,
        callbacks,
      });

      this.config = resumeConfig;
      this.lastConnectConfig = { ...resumeConfig };
      this._status = "connected";
      this.reconnectAttempts = 0;
      this.scheduleTokenRefresh();
      return true;
    } catch (error) {
      const attemptedResume = Boolean(resumeConfig.sessionResumption?.handle);

      if (attemptedResume) {
        this.log("client.resumeFallback", "resume failed, retrying fresh");
        this.lastResumable = false;
        this.lastResumptionHandle = null;

        const freshConfig = this.buildFreshConfig();
        if (freshConfig) {
          try {
            this._session = await this.client.live.connect({
              model: this._model,
              config: freshConfig,
              callbacks,
            });

            this.config = freshConfig;
            this.lastConnectConfig = { ...freshConfig };
            this._status = "connected";
            this.reconnectAttempts = 0;
            this.scheduleTokenRefresh();
            return true;
          } catch (fallbackError) {
            console.error(
              "Error reconnecting to GenAI Live with fresh session:",
              fallbackError,
            );
          }
        }
      }

      this._status = "disconnected";
      this._session = null;
      this.scheduleReconnect("reconnect-failed");
      console.error("Error reconnecting to GenAI Live:", error);
      return false;
    } finally {
      this.reconnecting = false;
    }
  }

  public disconnect() {
    this.manualDisconnect = true;
    this.clearTimers();

    if (!this.session) {
      return false;
    }
    this.session?.close();
    this._session = null;
    this._status = "disconnected";

    this.log("client.close", `Disconnected`);
    return true;
  }

  protected onopen() {
    this.log("client.open", "Connected");
    this.emit("open");
  }

  protected onerror(e: ErrorEvent) {
    console.error("[LiveAPI][server.error:event]", {
      message: e.message,
      filename: e.filename,
      lineno: e.lineno,
      colno: e.colno,
      error: e.error,
    });
    this.log("server.error", e.message);
    this.emit("error", e);
  }

  protected onclose(e: CloseEvent) {
    this._status = "disconnected";
    this._session = null;
    this.log(
      `server.close`,
      `disconnected (code: ${e.code}, clean: ${e.wasClean})${e.reason ? ` with reason: ${e.reason}` : ""}`,
    );
    if (!e.wasClean || e.code >= 4000) {
      console.error("[LiveAPI][server.close:abnormal]", {
        code: e.code,
        wasClean: e.wasClean,
        reason: e.reason,
      });
    }
    this.emit("close", e);

    if (this.suppressCloseRecovery) {
      this.suppressCloseRecovery = false;
      return;
    }

    if (!this.manualDisconnect) {
      this.scheduleReconnect(`close:${e.code}`);
    }
  }

  protected async onmessage(message: LiveServerMessage) {
    let handled = false;

    if (message.setupComplete) {
      this.log("server.send", "setupComplete");
      this.emit("setupcomplete");
      handled = true;
    }

    if (message.toolCall) {
      this.log("server.toolCall", message);
      this.emit("toolcall", message.toolCall);
      handled = true;
    }

    if (message.toolCallCancellation) {
      this.log("server.toolCallCancellation", message);
      this.emit("toolcallcancellation", message.toolCallCancellation);
      handled = true;
    }

    if (message.goAway) {
      this.log("server.goAway", message);
      const timeLeftMs = this.parseDurationMs(message.goAway.timeLeft);
      if (timeLeftMs !== null) {
        this.scheduleReconnectSoon(
          Math.max(0, timeLeftMs - GO_AWAY_RECONNECT_BUFFER_MS),
          "goaway",
        );
      } else {
        this.scheduleReconnectSoon(0, "goaway");
      }
      handled = true;
    }

    if (message.sessionResumptionUpdate) {
      this.log("server.sessionResumptionUpdate", "update");
      const { resumable, newHandle } = message.sessionResumptionUpdate;
      if (resumable && newHandle) {
        this.lastResumptionHandle = newHandle;
      }
      this.lastResumable = Boolean(resumable);
      this.emit("sessionresumptionupdate", message.sessionResumptionUpdate);
      handled = true;
    }

    if (message.usageMetadata) {
      handled = true;
    }

    // this json also might be `contentUpdate { interrupted: true }`
    // or contentUpdate { end_of_turn: true }
    if (message.serverContent) {
      handled = true;
      const { serverContent } = message;
      if ("interrupted" in serverContent) {
        this.log("server.content", "interrupted");
        this.emit("interrupted");
      }
      if ("turnComplete" in serverContent) {
        this.log("server.content", "turnComplete");
        this.emit("turncomplete");
      }

      if ("modelTurn" in serverContent) {
        let parts: Part[] = serverContent.modelTurn?.parts || [];

        // when its audio that is returned for modelTurn
        const audioParts = parts.filter(
          (p) => p.inlineData && p.inlineData.mimeType?.startsWith("audio/pcm"),
        );
        const base64s = audioParts.map((p) => p.inlineData?.data);

        // strip the audio parts out of the modelTurn
        const otherParts = difference(parts, audioParts);

        base64s.forEach((b64) => {
          if (b64) {
            const data = base64ToArrayBuffer(b64);
            this.emit("audio", data);
            this.log(`server.audio`, `buffer (${data.byteLength})`);
          }
        });
        if (otherParts.length) {
          parts = otherParts;

          const content: { modelTurn: Content } = { modelTurn: { parts } };
          this.emit("content", content);
          this.log(`server.content`, message);
        }
      }
    }

    if (!handled) {
      console.debug("[LiveAPI] received unmatched message", message);
    }
  }

  /**
   * send realtimeInput, this is base64 chunks of "audio/pcm" and/or "image/jpg"
   */
  sendRealtimeInput(chunks: Array<{ mimeType: string; data: string }>) {
    let hasAudio = false;
    let hasVideo = false;
    for (const ch of chunks) {
      if (ch.mimeType.includes("audio")) {
        this.session?.sendRealtimeInput({
          audio: { data: ch.data, mimeType: ch.mimeType },
        });
      } else if (
        ch.mimeType.includes("image") ||
        ch.mimeType.includes("video")
      ) {
        this.session?.sendRealtimeInput({
          video: { data: ch.data, mimeType: ch.mimeType },
        });
      }
      if (ch.mimeType.includes("audio")) {
        hasAudio = true;
      }
      if (ch.mimeType.includes("image") || ch.mimeType.includes("video")) {
        hasVideo = true;
      }
      if (hasAudio && hasVideo) {
        break;
      }
    }
    const message =
      hasAudio && hasVideo
        ? "audio + video"
        : hasAudio
          ? "audio"
          : hasVideo
            ? "video"
            : "unknown";
    this.log(`client.realtimeInput`, message);
  }

  sendRealtimeText(text: string) {
    this.session?.sendRealtimeInput({ text });
    this.log(`client.realtimeInput`, "text");
  }

  sendAudioStreamEnd() {
    this.session?.sendRealtimeInput({ audioStreamEnd: true });
    this.log(`client.realtimeInput`, "audioStreamEnd");
  }

  /**
   *  send a response to a function call and provide the id of the functions you are responding to
   */
  sendToolResponse(toolResponse: LiveClientToolResponse) {
    if (
      toolResponse.functionResponses &&
      toolResponse.functionResponses.length
    ) {
      this.session?.sendToolResponse({
        functionResponses: toolResponse.functionResponses,
      });
      this.log(`client.toolResponse`, toolResponse);
    }
  }
}
