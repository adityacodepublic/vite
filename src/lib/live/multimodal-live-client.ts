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
import { LiveClientOptions, StreamingLog } from "./types";
import { base64ToArrayBuffer } from "./chat-utils";

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
    this.client = new GoogleGenAI({ ...options, apiKey: options.apiKey ?? "" });
    this.onopen = this.onopen.bind(this);
    this.onerror = this.onerror.bind(this);
    this.onclose = this.onclose.bind(this);
    this.onmessage = this.onmessage.bind(this);
  }

  private async resolveApiKey(): Promise<string> {
    if (typeof this.options.getEphemeralToken === "function") {
      const token = await this.options.getEphemeralToken();
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

    this._status = "connecting";
    this.config = config;
    this._model = normalizedModel;

    const apiKey = await this.resolveApiKey();
    this.client = new GoogleGenAI({ ...this.options, apiKey });

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
    return true;
  }

  public disconnect() {
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
      handled = true;
    }

    if (message.sessionResumptionUpdate) {
      this.log("server.sessionResumptionUpdate", "update");
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
