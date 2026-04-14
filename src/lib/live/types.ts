import {
  GoogleGenAIOptions,
  LiveClientToolResponse,
  LiveServerMessage,
  Part,
} from "@google/genai";

export type LiveClientOptions = GoogleGenAIOptions & {
  apiKey?: string;
  getEphemeralToken?: () => Promise<string | EphemeralTokenResponse>;
};

export type EphemeralTokenResponse = {
  token: string;
  expireTime?: string;
  newSessionExpireTime?: string;
};

/** log types */
export type StreamingLog = {
  date: Date;
  type: string;
  count?: number;
  message:
    | string
    | ClientContentLog
    | Omit<LiveServerMessage, "text" | "data">
    | LiveClientToolResponse;
};

export type ClientContentLog = {
  turns: Part[];
  turnComplete: boolean;
};
