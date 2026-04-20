import { type FunctionDeclaration, Type } from "@google/genai";
import {
  bankingDeclarations,
  bankingFunctionsMap,
} from "@/lib/toolcall/banking/declarations";
import {
  chatCatalog,
  extractAvailableComponentsBlock,
} from "@/lib/json-render/chat-catalog";
import { parseRenderSpec } from "@/lib/json-render/chat-renderer";
import { useChatStore } from "@/lib/chat/store";
import { invokeSnapshotHandler } from "@/lib/toolcall/snapshot-runtime";

const RENDER_UI_COMPONENTS_DOC =
  extractAvailableComponentsBlock(chatCatalog.prompt()) ||
  "AVAILABLE COMPONENTS: Card, Stack, Heading, Text, Badge, Separator, Table, Alert";

const RENDER_UI_DOC = [
  "Render structured chat UI from a JSON string payload.",
  "Send `spec_json` as a JSON string. Accepted forms: { spec: { root, state? } } or { root, state? }.",
  "Use nested tree nodes only (root -> children). Do not send JSONL patch lines or flat /elements maps.",
  "Each node should look like: { type, props?, children? }. `type` must be one of the supported components below.",
  "If the user asks to render/demo components without full data, fill missing required fields with sensible sample values using your best judgment. Or ask the user UG",
  "Prefer producing a valid render payload over asking follow-up questions when intent is component preview/demo.",
  "Never leave required component fields empty or omitted.",
  "Minimal valid starter fields by component:",
  "- Heading/Text/Badge: provide `props.text`.",
  "- Alert: provide `props.title` (optional: message/type).",
  "- Table: provide non-empty `props.columns` and `props.rows`.",
  "Keep the UI concise and relevant to the user request.",
  "",
  RENDER_UI_COMPONENTS_DOC,
].join("\n");

export type ToolAvailabilityOptions = {
  bankingEnabled?: boolean;
};

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

const coreFunctionsMap: Record<string, (...args: never[]) => unknown> = {
  render_altair: (args: { json_graph?: unknown }) => {
    const candidate = args.json_graph;
    if (typeof candidate === "string") {
      return candidate;
    }
    if (candidate && typeof candidate === "object") {
      return JSON.stringify(candidate);
    }
    throw new Error(
      "render_altair requires chart JSON in json_graph",
    );
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
        summary: {
          rootType: null,
          nodeCount: 0,
        },
      };
    }
  },
  markdown_board: (args: {
    command: "ls" | "read" | "create" | "full_write" | "delete";
    cardId?: string;
    data?: {
      title?: string;
      markdown?: string;
    };
  }) => {
    const store = useChatStore.getState();
    switch (args.command) {
      case "ls":
        return store.listMarkdownCards();
      case "read": {
        if (!args.cardId) {
          throw new Error("markdown_board read requires cardId.");
        }
        const card = store.getMarkdownCard(args.cardId);
        if (!card) {
          throw new Error(`Markdown card '${args.cardId}' was not found.`);
        }
        return card;
      }
      case "create": {
        const title = args.data?.title?.trim();
        const markdown = args.data?.markdown?.trim();
        if (!title || !markdown) {
          throw new Error(
            "markdown_board create requires data.title and data.markdown.",
          );
        }
        const card = store.createMarkdownCard({ title, markdown });
        return {
          created: true,
          cardId: card.id,
          title: card.title,
        };
      }
      case "full_write": {
        if (!args.cardId) {
          throw new Error("markdown_board full_write requires cardId.");
        }
        const markdown = args.data?.markdown?.trim();
        if (!markdown) {
          throw new Error("markdown_board full_write requires data.markdown.");
        }
        const card = store.replaceMarkdownCard(args.cardId, {
          title: args.data?.title,
          markdown,
        });
        return {
          updated: true,
          cardId: card.id,
          title: card.title,
        };
      }
      case "delete": {
        if (!args.cardId) {
          throw new Error("markdown_board delete requires cardId.");
        }
        const card = store.getMarkdownCard(args.cardId);
        if (!card) {
          throw new Error(`Markdown card '${args.cardId}' was not found.`);
        }
        store.removeMarkdownCard(args.cardId);
        return {
          deleted: true,
          cardId: args.cardId,
          title: card.title,
        };
      }
      default:
        throw new Error("markdown_board received an unsupported command.");
    }
  },
  capture_snapshot: async (args: { source: "screen" | "camera" }) => {
    if (args?.source !== "screen" && args?.source !== "camera") {
      throw new Error("capture_snapshot requires source 'screen' or 'camera'.");
    }

    return invokeSnapshotHandler({ source: args.source });
  },
};

const devOnlyFunctionsMap: Record<string, (...args: never[]) => unknown> =
  import.meta.env.DEV
    ? {
        sendToUser: (args: { text: string }) => {
          console.log("[sendToUser]", args.text);
          return { delivered: true, text: args.text };
        },
      }
    : {};

const coreDeclarations: FunctionDeclaration[] = [
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
            'JSON string for UI spec. Recommended form: {"spec":{"root":{"type":"Card","children":[{"type":"Text","props":{"text":"Hello"}}]}}}. You may also send {"root":{...}} directly. \n If a component fails to render then, understand the error, fix the issue and try again. Repeat up to 5-6 attempts with different fixes if needed, Only report failure if all attempts fail, and include the likely cause.',
        },
      },
      required: ["spec_json"],
    },
  },
  {
    name: "markdown_board",
    description:
      "Manage the markdown board cards directly. Use this tool for all board/card operations instead of render_ui. 'Scan' means: when the user asks you to inspect something visible on screen, camera, uploaded media, shared media, or other provided data, gather the relevant observations and store them in a markdown board card. Use command 'ls' first to inspect the board state; it returns all cards with id and title and also tells you which card is currently open. Use 'read' before revising an existing card. Use 'create' to add a new card. Use 'full_write' only when intentionally replacing an entire card body, optionally with a new title. Use 'delete' to remove an obsolete card. Prefer preserving useful existing notes unless the user explicitly asks to overwrite or remove them.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        command: {
          type: Type.STRING,
          description:
            "Board operation to execute. Use 'ls' to list cards, 'read' to read one card, 'create' to add a card, 'full_write' to replace a card, or 'delete' to remove one.",
          enum: ["ls", "read", "create", "full_write", "delete"],
        },
        cardId: {
          type: Type.STRING,
          description:
            "Target card id for 'read', 'full_write', or 'delete'. Not used for 'ls'.",
        },
        data: {
          type: Type.OBJECT,
          description:
            "Payload for write operations. For 'create', provide title and markdown. For 'full_write', provide markdown and optionally title.",
          properties: {
            title: {
              type: Type.STRING,
              description:
                "Card title for create, or optional replacement title for full_write.",
            },
            markdown: {
              type: Type.STRING,
              description:
                "Full markdown body to create or fully replace a card with.",
            },
          },
        },
      },
      required: ["command"],
    },
  },
  {
    name: "capture_snapshot",
    description:
      "Capture a high-quality snapshot of screen or camera feed and receive its image through the tool response itself. Use source 'screen' for a native desktop screenshot, or source 'camera' for capture from the camera feed. After calling this tool, inspect the returned image from the tool response before answering.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        source: {
          type: Type.STRING,
          description:
            "Capture source. Use 'screen' for a native desktop screenshot, or 'camera' for a webcam still image.",
          enum: ["screen", "camera"],
        },
      },
      required: ["source"],
    },
  },
];

const devOnlyDeclarations: FunctionDeclaration[] = import.meta.env.DEV
  ? [
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
    ]
  : [];

export function getFunctionMap(
  options: ToolAvailabilityOptions = {},
): Record<string, (...args: never[]) => unknown> {
  return {
    ...coreFunctionsMap,
    ...devOnlyFunctionsMap,
    ...(options.bankingEnabled ? bankingFunctionsMap : {}),
  };
}

export function getFunctionDeclarations(
  options: ToolAvailabilityOptions = {},
): FunctionDeclaration[] {
  return [
    ...coreDeclarations,
    ...devOnlyDeclarations,
    ...(options.bankingEnabled ? bankingDeclarations : []),
  ];
}
