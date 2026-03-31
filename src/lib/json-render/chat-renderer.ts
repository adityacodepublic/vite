import { z } from "zod";
import type { MarkdownBoardCardInput } from "@/lib/chat/store";

const MAX_SPEC_CHARS = 32_000;
const MAX_NODE_COUNT = 180;
const MAX_DEPTH = 12;
const MAX_STRING_CHARS = 4_000;
const MAX_ARRAY_ITEMS = 80;

export const markdownCardsPropsSchema = z.object({
  title: z.string().max(140).optional().nullable(),
  cards: z
    .array(
      z.object({
        id: z.string().max(120).optional().nullable(),
        title: z.string().min(1).max(180),
        markdown: z.string().min(1).max(10_000),
      }),
    )
    .min(1)
    .max(50),
});

const ALLOWED_COMPONENTS = new Set([
  "Card",
  "Stack",
  "Heading",
  "Text",
  "Badge",
  "Separator",
  "Table",
  "Alert",
  "MarkdownCards",
]);

export type TreeNode = {
  type: string;
  props?: Record<string, unknown>;
  children?: TreeNode[];
};

export type TreeSpec = {
  root: TreeNode;
  state?: Record<string, unknown>;
};

export type ParsedRenderSpec = {
  spec: TreeSpec | null;
  valid: boolean;
  issues: string[];
  markdownCards: MarkdownBoardCardInput[];
  summary: {
    rootType: string | null;
    nodeCount: number;
  };
};

type UnsafeNode = {
  type?: unknown;
  props?: unknown;
  children?: unknown;
  on?: unknown;
  watch?: unknown;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function parsePossiblyNestedJson(payload: string): unknown {
  let current: unknown = payload;

  for (let i = 0; i < 3; i += 1) {
    if (typeof current !== "string") {
      break;
    }

    const trimmed = current.trim();
    if (!trimmed) {
      break;
    }

    const looksLikeJson =
      trimmed.startsWith("{") ||
      trimmed.startsWith("[") ||
      (trimmed.startsWith('"') && trimmed.endsWith('"'));

    if (!looksLikeJson) {
      break;
    }

    try {
      current = JSON.parse(trimmed);
    } catch {
      break;
    }
  }

  return current;
}

function normalizeSpecPayload(payload: unknown): unknown {
  if (!isObject(payload)) {
    return payload;
  }

  if (isObject(payload.root)) {
    return payload;
  }

  if (isObject(payload.spec)) {
    return payload.spec;
  }

  if (typeof payload.spec_json === "string") {
    return normalizeSpecPayload(parsePossiblyNestedJson(payload.spec_json));
  }

  return payload;
}

function scanPropValue(value: unknown, issues: string[], path: string): void {
  if (typeof value === "string") {
    if (value.length > MAX_STRING_CHARS) {
      issues.push(`${path} has a string longer than ${MAX_STRING_CHARS} chars.`);
    }
    return;
  }

  if (Array.isArray(value)) {
    if (value.length > MAX_ARRAY_ITEMS) {
      issues.push(`${path} has more than ${MAX_ARRAY_ITEMS} items.`);
      return;
    }
    value.forEach((item, index) => {
      scanPropValue(item, issues, `${path}[${index}]`);
    });
    return;
  }

  if (isObject(value)) {
    Object.entries(value).forEach(([key, nested]) => {
      scanPropValue(nested, issues, `${path}.${key}`);
    });
  }
}

function guardSpec(spec: unknown): {
  valid: boolean;
  issues: string[];
  nodeCount: number;
  rootType: string | null;
} {
  const issues: string[] = [];

  if (!isObject(spec)) {
    return {
      valid: false,
      issues: ["Spec must be a JSON object."],
      nodeCount: 0,
      rootType: null,
    };
  }

  const root = spec.root;
  if (!isObject(root)) {
    return {
      valid: false,
      issues: ["Spec must include an object root element."],
      nodeCount: 0,
      rootType: null,
    };
  }

  let nodeCount = 0;
  const rootType = typeof root.type === "string" ? root.type : null;

  const visit = (node: UnsafeNode, depth: number, path: string) => {
    nodeCount += 1;

    if (nodeCount > MAX_NODE_COUNT) {
      issues.push(`Spec has more than ${MAX_NODE_COUNT} elements.`);
      return;
    }

    if (depth > MAX_DEPTH) {
      issues.push(`Spec nesting exceeds maximum depth of ${MAX_DEPTH}.`);
      return;
    }

    if (typeof node.type !== "string") {
      issues.push(`${path}.type must be a string.`);
    } else if (!ALLOWED_COMPONENTS.has(node.type)) {
      issues.push(`${path}.type '${node.type}' is not allowed.`);
    }

    if ("on" in node || "watch" in node) {
      issues.push(`${path} cannot include interactive bindings (on/watch).`);
    }

    if (node.props !== undefined) {
      if (!isObject(node.props)) {
        issues.push(`${path}.props must be an object.`);
      } else {
        scanPropValue(node.props, issues, `${path}.props`);
      }
    }

    if (node.type === "MarkdownCards") {
      const parsed = markdownCardsPropsSchema.safeParse(node.props ?? {});
      if (!parsed.success) {
        issues.push(`${path}.props is invalid for MarkdownCards.`);
      }
    }

    if (node.children !== undefined) {
      if (!Array.isArray(node.children)) {
        issues.push(`${path}.children must be an array.`);
      } else {
        if (node.children.length > MAX_ARRAY_ITEMS) {
          issues.push(`${path}.children exceeds ${MAX_ARRAY_ITEMS} items.`);
          return;
        }

        node.children.forEach((child, index) => {
          if (!isObject(child)) {
            issues.push(`${path}.children[${index}] must be an object.`);
            return;
          }
          visit(child as UnsafeNode, depth + 1, `${path}.children[${index}]`);
        });
      }
    }
  };

  visit(root as UnsafeNode, 1, "root");

  return { valid: issues.length === 0, issues, nodeCount, rootType };
}

function extractMarkdownCards(spec: unknown): MarkdownBoardCardInput[] {
  if (!isObject(spec) || !isObject(spec.root)) {
    return [];
  }

  const cards: MarkdownBoardCardInput[] = [];

  const visit = (node: UnsafeNode) => {
    if (node.type === "MarkdownCards" && isObject(node.props)) {
      const parsed = markdownCardsPropsSchema.safeParse(node.props);
      if (parsed.success) {
        parsed.data.cards.forEach((item) => {
          cards.push({
            id: item.id ?? undefined,
            title: item.title,
            markdown: item.markdown,
          });
        });
      }
    }

    if (Array.isArray(node.children)) {
      node.children.forEach((child) => {
        if (isObject(child)) {
          visit(child as UnsafeNode);
        }
      });
    }
  };

  visit(spec.root as UnsafeNode);
  return cards;
}

function extractCardAsMarkdown(spec: unknown): MarkdownBoardCardInput[] {
  if (!isObject(spec) || !isObject(spec.root)) {
    return [];
  }

  const root = spec.root as UnsafeNode;
  if (root.type !== "Card" || !isObject(root.props)) {
    return [];
  }

  const title = typeof root.props.title === "string" ? root.props.title.trim() : "";
  if (!title) {
    return [];
  }

  const lines: string[] = [];

  const visit = (node: UnsafeNode) => {
    if (isObject(node.props) && node.type === "Text") {
      const text = node.props.text;
      if (typeof text === "string" && text.trim()) {
        lines.push(text.trim());
      }
    }

    if (Array.isArray(node.children)) {
      node.children.forEach((child) => {
        if (isObject(child)) {
          visit(child as UnsafeNode);
        }
      });
    }
  };

  visit(root);

  const markdown = lines.join("\n\n").trim();
  if (!markdown) {
    return [];
  }

  return [{ title, markdown }];
}

function extractBoardCards(spec: unknown): MarkdownBoardCardInput[] {
  const markdownCards = extractMarkdownCards(spec);
  if (markdownCards.length) {
    return markdownCards;
  }

  return extractCardAsMarkdown(spec);
}

export function parseRenderSpec(specJson: string): ParsedRenderSpec {
  try {
    if (specJson.length > MAX_SPEC_CHARS) {
      return {
        spec: null,
        valid: false,
        issues: [`Spec exceeds ${MAX_SPEC_CHARS} characters.`],
        markdownCards: [],
        summary: {
          rootType: null,
          nodeCount: 0,
        },
      };
    }

    const parsed = parsePossiblyNestedJson(specJson);
    const normalized = normalizeSpecPayload(parsed);
    const guarded = guardSpec(normalized);

    if (!guarded.valid) {
      return {
        spec: null,
        valid: false,
        issues: guarded.issues,
        markdownCards: extractBoardCards(normalized),
        summary: {
          rootType: guarded.rootType,
          nodeCount: guarded.nodeCount,
        },
      };
    }

    return {
      spec: normalized as TreeSpec,
      valid: true,
      issues: [],
      markdownCards: extractBoardCards(normalized),
      summary: {
        rootType: guarded.rootType,
        nodeCount: guarded.nodeCount,
      },
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to parse render spec.";
    return {
      spec: null,
      valid: false,
      issues: [message],
      markdownCards: [],
      summary: {
        rootType: null,
        nodeCount: 0,
      },
    };
  }
}
