import { type FunctionDeclaration, Type } from "@google/genai";
import {
  startSession,
  listSessions,
  getSessionUpdates,
} from "@/lib/toolcall/functions";
import {
  bankingDeclarations,
  bankingFunctionsMap,
} from "@/lib/toolcall/banking/declarations";
import {
  chatCatalog,
  extractAvailableComponentsBlock,
} from "@/lib/json-render/chat-catalog";
import { parseRenderSpec } from "@/lib/json-render/chat-renderer";

const RENDER_UI_COMPONENTS_DOC =
  extractAvailableComponentsBlock(chatCatalog.prompt()) ||
  "AVAILABLE COMPONENTS: Card, Stack, Heading, Text, Badge, Separator, Table, Alert, MarkdownCards";

const RENDER_UI_DOC = [
  "Render structured chat UI from a JSON string payload.",
  "Send `spec_json` as a JSON string. Accepted forms: { spec: { root, state? } } or { root, state? }.",
  "Use nested tree nodes only (root -> children). Do not send JSONL patch lines or flat /elements maps.",
  "Each node should look like: { type, props?, children? }. `type` must be one of the supported components below.",
  "If the user asks to render/demo components without full data, fill missing required fields with sensible sample values using your best judgment. Or ask the user UG",
  "Prefer producing a valid render payload over asking follow-up questions when intent is component preview/demo.",
  "Never leave required component fields empty or omitted.",
  "For markdown cards, use: { type: 'MarkdownCards', props: { title?, cards: [{ title, markdown, id? }] } }.",
  "Minimal valid starter fields by component:",
  "- Heading/Text/Badge: provide `props.text`.",
  "- Alert: provide `props.title` (optional: message/type).",
  "- Table: provide non-empty `props.columns` and `props.rows`.",
  "- MarkdownCards: provide non-empty `props.cards` with { title, markdown }.",
  "Keep the UI concise and relevant to the user request.",
  "",
  RENDER_UI_COMPONENTS_DOC,
].join("\n");

// const RENDER_UI_DOC = [
//   "Render structured chat UI from a JSON string payload.",
//   "Send `spec_json` as a JSON string. Accepted forms: { spec: { root, state? } } or { root, state? }.",
//   "Use nested tree nodes only (root -> children). Do not send JSONL patch lines or flat /elements maps.",
//   "Each node should look like: { type, props?, children? }. `type` must be one of the supported components below.",
//   "If the user asks to render/demo components without full data, fill missing required fields with sensible sample values using your best judgment. Or ask the user UG",
//   "Prefer producing a valid render payload over asking follow-up questions when intent is component preview/demo.",
//   "Never leave required component fields empty or omitted.",
//   chatCatalog.prompt(),
// ].join("\n");

function parseRenderUiInput(specJson: string): unknown {
  const parsed = JSON.parse(specJson) as unknown;
  if (
    parsed &&
    typeof parsed === "object" &&
    !Array.isArray(parsed) &&
    "spec" in parsed
  ) {
    return (parsed as { spec: unknown }).spec;
  }
  return parsed;
}

const coreFunctionsMap: Record<string, any> = {
  startSession: (args: {
    prompt: string;
    sessionId?: string;
    model?: string;
    clientId?: string;
  }) => {
    return startSession(args.prompt, args.sessionId, args.model, args.clientId);
  },
  listSessions: (args: { numberOfDaysBefore?: number }) => {
    return listSessions(args?.numberOfDaysBefore ?? 0);
  },
  getSessionUpdates: (args: { sessionId: string }) => {
    return getSessionUpdates(args.sessionId);
  },
  render_altair: (args: { json_graph: string }) => {
    return args.json_graph;
  },
  render_ui: (args: { spec_json: string }) => {
    try {
      const input = parseRenderUiInput(args.spec_json);
      const parsed = parseRenderSpec(input);
      console.log("[render_ui] received JSON:", args.spec_json);
      console.log(
        "[render_ui] parsed result:",
        JSON.stringify(parsed, null, 2),
      );
      return parsed;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Invalid JSON payload.";
      console.error("[render_ui] invalid JSON", {
        error,
        spec_json: args.spec_json,
      });
      return {
        spec: null,
        valid: false,
        issues: [`spec_json: ${message}`],
        warnings: [],
        markdownCards: [],
        summary: {
          rootType: null,
          nodeCount: 0,
        },
      };
    }
  },
  sendToUser: (args: { text: string }) => {
    console.log("[sendToUser]", args.text);
    return { delivered: true, text: args.text };
  },
};

export const functionsmap: Record<string, any> = {
  ...coreFunctionsMap,
  ...bankingFunctionsMap,
};

const coreDeclarations: FunctionDeclaration[] = [
  {
    name: "startSession",
    description:
      "You have a core agent (your) to help you. Handover Browser, files related tasks and any complex tasks you can't do to your core agent. Use this when a new user goal arrives and you don't have tools to do it or when you need the core agent to continue an existing work thread ( find existing sessions with listSessions ). Provide a clear, self-contained prompt describing the task to execute. If continuing prior work, include sessionId. Optionally set model when routing requires a specific model. github-copilot/gemini-3-flash-preview (good for browsing), github-copilot/gpt-5.3-codex in most cases no need to set model, the core agent will route to the best model.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        prompt: {
          type: Type.STRING,
          description:
            "Instruction payload for the core agent. Include task intent, constraints, expected output, and any relevant context.",
        },
        sessionId: {
          type: Type.STRING,
          description:
            "Existing session ID to continue the same core-agent workflow instead of creating a new session.",
        },
        model: {
          type: Type.STRING,
          description:
            "Optional model name for routing (for example, when quality/speed/cost requirements require a specific model).",
        },
        clientId: {
          type: Type.STRING,
          description:
            "Whenever User whenever user tells give the task to coworker. first use listSessions to get onlineFollowerId which is not 'your' and use that id as clientId to startsession. Its optional if no onlineFollowerId is present.",
        },
      },
      required: ["prompt"],
    },
  },
  {
    name: "listSessions",
    description:
      "List agent sessions grouped by worker node with optional history window. Response shape is { your: Session[], <onlineFollowerName>: Session[] }. Only active online followers are included.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        numberOfDaysBefore: {
          type: Type.NUMBER,
          description:
            "Optional day window before today (0-5). 0 means today only, 1 means today + yesterday, up to max 5 days before.",
        },
      },
      required: [],
    },
  },
  {
    name: "getSessionUpdates",
    description:
      "Fetch latest progress/content from a specific core-agent session. Use this after startSession or when polling a running task to get incremental updates and final output.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        sessionId: {
          type: Type.STRING,
          description:
            "Target session ID whose latest state and content should be retrieved.",
        },
      },
      required: ["sessionId"],
    },
  },
  {
    name: "render_altair",
    description: "Displays an altair graph in json format.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        json_graph: {
          type: Type.STRING,
          description:
            "JSON STRING representation of the graph to render. Must be a string, not a json object",
        },
      },
      required: ["json_graph"],
    },
  },
  {
    name: "render_ui",
    description: RENDER_UI_DOC,
    parameters: {
      type: Type.OBJECT,
      properties: {
        spec_json: {
          type: Type.STRING,
          description:
            'JSON string for UI spec. Recommended form: {"spec":{"root":{"type":"MarkdownCards","props":{"cards":[{"title":"Topic","markdown":"## Notes"}]}}}}. You may also send {"root":{...}} directly.',
        },
      },
      required: ["spec_json"],
    },
  },
  {
    name: "sendToUser",
    description: "Send a direct plain-text message to the user channel.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        text: {
          type: Type.STRING,
          description: "Message text to send to the user.",
        },
      },
      required: ["text"],
    },
  },
];

export const declaration: FunctionDeclaration[] = [
  ...coreDeclarations,
  ...bankingDeclarations,
];
