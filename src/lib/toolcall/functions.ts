const SESSION_API_BASE =
  (import.meta.env.VITE_SESSION_API_BASE as string | undefined) ??
  "http://localhost:3458";

type StartSessionRequest = {
  sessionId?: string;
  prompt: string;
  model?: string;
  clientId?: string;
};

type StartSessionResponse =
  | {
      success: true;
      sessionId: string;
      title: string;
      status: "running";
    }
  | {
      success: false;
      error: string;
    };

type SessionSummary = {
  id: string;
  title: string;
  status: "running" | "finished";
};

type ListSessionsResponse = Record<string, SessionSummary[]>;

type GetUpdatesResponse =
  | {
      success: true;
      sessionId: string;
      title: string;
      status: "running" | "finished";
      latestContent: string;
    }
  | {
      success: false;
      error: string;
    };

type CaptureSnapshotRequest = {
  maxBytes?: number;
};

export type CaptureSnapshotResponse =
  | {
      success: true;
      mimeType: string;
      data: string;
      width: number;
      height: number;
      timestamp: string;
    }
  | {
      success: false;
      error: string;
    };

export async function startSession(
  prompt: string,
  sessionId?: string,
  model: string = "github-copilot/gpt-5.3-codex",
  clientId?: string,
): Promise<StartSessionResponse> {
  const body: StartSessionRequest = { prompt };
  if (sessionId) body.sessionId = sessionId;
  if (clientId) body.clientId = clientId;
  body.model = model;

  const response = await fetch(`${SESSION_API_BASE}/session/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  return response.json();
}

export async function listSessions(
  numberOfDaysBefore: number = 0,
): Promise<ListSessionsResponse> {
  const query = `?numberOfDaysBefore=${encodeURIComponent(String(numberOfDaysBefore))}`;
  const response = await fetch(`${SESSION_API_BASE}/sessions${query}`);
  return response.json();
}

export async function getSessionUpdates(
  sessionId: string,
): Promise<GetUpdatesResponse> {
  const response = await fetch(
    `${SESSION_API_BASE}/session/${sessionId}/updates`,
  );
  return response.json();
}

export async function captureNativeScreenSnapshot(
  maxBytes: number = 2_000_000,
): Promise<CaptureSnapshotResponse> {
  const response = await fetch(`${SESSION_API_BASE}/capture/snapshot`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      maxBytes,
    } satisfies CaptureSnapshotRequest),
  });

  return response.json();
}

export * from "./banking/functions";
