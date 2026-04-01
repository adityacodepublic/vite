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

export async function listSessions(): Promise<ListSessionsResponse> {
  const response = await fetch(`${SESSION_API_BASE}/sessions`);
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

export * from "./banking/functions";
