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
  read_camera_markdown: () => {
    const state = useChatStore.getState().cameraMarkdown;
    return {
      title: state.title,
      markdown: state.markdown,
      isOpen: state.isOpen,
      charCount: state.markdown.length,
    };
  },
  write_camera_markdown: (args: {
    markdown: string;
    mode?: "replace" | "append";
  }) => {
    const mode = args.mode === "append" ? "append" : "replace";
    const store = useChatStore.getState();
    const previous = store.cameraMarkdown.markdown;
    const nextMarkdown =
      mode === "append"
        ? `${previous}${previous && args.markdown ? "\n\n" : ""}${args.markdown}`
        : args.markdown;

    store.updateCameraMarkdown(nextMarkdown);

    return {
      updated: true,
      mode,
      previousCharCount: previous.length,
      nextCharCount: nextMarkdown.length,
    };
  },
  capture_snapshot: async (args: { source: "screen" | "camera" }) => {
    if (args?.source !== "screen" && args?.source !== "camera") {
      throw new Error("capture_snapshot requires source 'screen' or 'camera'.");
    }

    return invokeSnapshotHandler({ source: args.source });
  },
};

export const functionsmap: Record<string, any> = {
  ...coreFunctionsMap,
  ...bankingFunctionsMap,
};

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
            'JSON string for UI spec. Recommended form: {"spec":{"root":{"type":"MarkdownCards","props":{"cards":[{"title":"Topic","markdown":"## Notes"}]}}}}. You may also send {"root":{...}} directly. \n If a component fails to render then, understand the error, fix the issue and try again. Repeat up to 5-6 attempts with different fixes if needed, Only report failure if all attempts fail, and include the likely cause.',
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
  {
    name: "read_camera_markdown",
    description:
      "Read the current contents of the persistent camera markdown document. Use this before edits so you can revise existing content accurately.",
    parameters: {
      type: Type.OBJECT,
      properties: {},
      required: [],
    },
  },
  {
    name: "write_camera_markdown",
    description:
      "For camera-to-markdown workflows, read existing document content with read_camera_markdown before edits, then update it with write_camera_markdown. Prefer append so existing content is preserved, and do not remove or replace pre-existing content unless the user explicitly asks for that. Read the current document first when revising existing notes.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        markdown: {
          type: Type.STRING,
          description:
            "Markdown content to write into the camera markdown document.",
        },
        mode: {
          type: Type.STRING,
          description:
            "Write mode. Use 'replace' to overwrite the entire current content, or 'append' to add to the end.",
          enum: ["replace", "append"],
        },
      },
      required: ["markdown"],
    },
  },
  {
    name: "capture_snapshot",
    description:
      "Capture a high-quality snapshot of screen or camera feed and get its image. Use source 'screen' for a native desktop screenshot, or source 'camera' for capture from the camera feed. Wait for the image to be recieved by you (as it can take a few seconds to reach you) before responding.",
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

export const declaration: FunctionDeclaration[] = [
  ...coreDeclarations,
  ...bankingDeclarations,
];
