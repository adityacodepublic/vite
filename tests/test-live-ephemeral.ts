import { GoogleGenAI, Modality } from "@google/genai";

const TOKEN_ENDPOINT =
  process.env.VITE_GEMINI_TOKEN_SERVER_URL ??
  "https://gemini-live-token-server.simpelskiff.workers.dev/token";
const ALLOWED_ORIGIN =
  process.env.TOKEN_REQUEST_ORIGIN ?? "https://modal2-pi.vercel.app";
const MODEL = "gemini-3.1-flash-live-preview";

async function getEphemeralToken() {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: ALLOWED_ORIGIN,
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
  const token = await getEphemeralToken();
  console.log(`[token] received ephemeral token: ${token.slice(0, 16)}...`);

  let setupComplete = false;
  let openReceived = false;

  const ai = new GoogleGenAI({
    apiKey: token,
    apiVersion: "v1alpha",
  });

  const session = await ai.live.connect({
    model: MODEL,
    config: {
      responseModalities: [Modality.AUDIO],
      sessionResumption: {},
    },
    callbacks: {
      onopen: () => {
        openReceived = true;
        console.log("[live] websocket open");
      },
      onmessage: (message) => {
        if (message.setupComplete) {
          setupComplete = true;
          console.log("[live] setup complete");
        }
      },
      onerror: (event) => {
        console.error("[live] error event", event.message || event);
      },
      onclose: (event) => {
        console.log(
          `[live] closed code=${event.code} clean=${event.wasClean} reason=${event.reason || ""}`,
        );
      },
    },
  });

  const started = Date.now();
  while (!setupComplete && Date.now() - started < 7000) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  session.close();

  if (!openReceived) {
    throw new Error("Live API websocket did not open");
  }
  if (!setupComplete) {
    throw new Error("Live API did not send setupComplete within timeout");
  }

  console.log("[ok] Live API ephemeral token flow works");
}

main().catch((error) => {
  console.error("[fail]", error instanceof Error ? error.message : error);
  process.exit(1);
});
