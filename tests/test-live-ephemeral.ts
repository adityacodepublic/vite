import { GoogleGenAI, Modality } from "@google/genai";

const TOKEN_ENDPOINT =
  process.env.VITE_GEMINI_TOKEN_SERVER_URL ??
  "https://gemini-live-token-server.simpelskiff.workers.dev/token";
const ALLOWED_ORIGIN =
  process.env.TOKEN_REQUEST_ORIGIN ?? "https://modal2-pi.vercel.app";
const TOKEN_BYPASS_KEY = process.env.VITE_GEMINI_TOKEN_BYPASS_KEY;
const MODEL = "gemini-3.1-flash-live-preview";

async function getEphemeralToken() {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: ALLOWED_ORIGIN,
      ...(TOKEN_BYPASS_KEY ? { "x-live-token-key": TOKEN_BYPASS_KEY } : {}),
    },
    body: JSON.stringify({ model: MODEL }),
  });

  const bodyText = await response.text();
  if (!response.ok) {
    throw new Error(
      `Token request failed (${response.status}): ${bodyText || "no body"}`,
    );
  }

  const body = JSON.parse(bodyText) as { token?: string };
  if (!body.token) {
    throw new Error("Token response did not include token");
  }

  return body.token;
}

async function main() {
  console.log(`[token] endpoint: ${TOKEN_ENDPOINT}`);
  const token1 = await getEphemeralToken();
  console.log(`[token] initial token: ${token1.slice(0, 16)}...`);

  let setupComplete1 = false;
  let resumableHandle: string | null = null;

  const ai1 = new GoogleGenAI({ apiKey: token1, apiVersion: "v1alpha" });
  const session1 = await ai1.live.connect({
    model: MODEL,
    config: {
      responseModalities: [Modality.AUDIO],
      sessionResumption: {},
    },
    callbacks: {
      onopen: () => {
        console.log("[live-1] websocket open");
      },
      onmessage: (message) => {
        if (message.setupComplete) {
          setupComplete1 = true;
          console.log("[live-1] setup complete");
        }

        const update = message.sessionResumptionUpdate;
        if (update?.resumable && update.newHandle) {
          resumableHandle = update.newHandle;
          console.log("[live-1] resumable handle received");
        }
      },
      onerror: (event) => {
        console.error("[live-1] error", event.message || event);
      },
      onclose: (event) => {
        console.log(
          `[live-1] closed code=${event.code} clean=${event.wasClean} reason=${event.reason || ""}`,
        );
      },
    },
  });

  const startedSetup1 = Date.now();
  while (!setupComplete1 && Date.now() - startedSetup1 < 12000) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  if (!setupComplete1) {
    throw new Error("Initial connection did not send setupComplete");
  }

  session1.sendRealtimeInput({ text: "Say only: ready" });

  const started1 = Date.now();
  while (!resumableHandle && Date.now() - started1 < 12000) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  if (!resumableHandle) {
    throw new Error("No resumable handle received from initial session");
  }

  session1.close();

  const token2 = await getEphemeralToken();
  console.log(`[token] refresh token: ${token2.slice(0, 16)}...`);

  let setupComplete2 = false;

  const ai2 = new GoogleGenAI({ apiKey: token2, apiVersion: "v1alpha" });
  const session2 = await ai2.live.connect({
    model: MODEL,
    config: {
      responseModalities: [Modality.AUDIO],
      sessionResumption: {
        handle: resumableHandle,
      },
    },
    callbacks: {
      onopen: () => {
        console.log("[live-2] websocket open");
      },
      onmessage: (message) => {
        if (message.setupComplete) {
          setupComplete2 = true;
          console.log("[live-2] setup complete (resumed)");
        }

      },
      onerror: (event) => {
        console.error("[live-2] error", event.message || event);
      },
      onclose: (event) => {
        console.log(
          `[live-2] closed code=${event.code} clean=${event.wasClean} reason=${event.reason || ""}`,
        );
      },
    },
  });

  const started2 = Date.now();
  while (!setupComplete2 && Date.now() - started2 < 12000) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  session2.close();

  if (!setupComplete2) {
    throw new Error("Resumed connection did not send setupComplete");
  }
  console.log("[ok] Live API token refresh + session resumption works");
}

main().catch((error) => {
  console.error("[fail]", error instanceof Error ? error.message : error);
  process.exit(1);
});
