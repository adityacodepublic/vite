import { z } from "zod";
import type { MarkdownBoardCardInput } from "@/lib/chat/store";

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

export const ALLOWED_COMPONENTS = [
  "Card",
  "Stack",
  "Heading",
  "Text",
  "Badge",
  "Separator",
  "Table",
  "Alert",
  "MarkdownCards",
] as const;

export type TreeNode = {
  type: (typeof ALLOWED_COMPONENTS)[number];
  props?: Record<string, unknown>;
  children?: TreeNode[];
  [key: string]: unknown;
};

export type TreeSpec = {
  root: TreeNode;
  state?: Record<string, unknown>;
};

export type ParsedRenderSpec = {
  spec: TreeSpec | null;
  valid: boolean;
  issues: string[];
  warnings: string[];
  markdownCards: MarkdownBoardCardInput[];
  summary: {
    rootType: string | null;
    nodeCount: number;
  };
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const componentTypeSchema = z.enum(ALLOWED_COMPONENTS);

const recordSchema = z.record(z.string(), z.unknown());

const treeNodeSchema: z.ZodType<TreeNode> = z.lazy(() =>
  z
    .object({
      type: componentTypeSchema,
      props: recordSchema.optional(),
      children: z.array(treeNodeSchema).optional(),
    })
    .superRefine((node, ctx) => {
      if (node.type !== "MarkdownCards") {
        return;
      }

      const parsed = markdownCardsPropsSchema.safeParse(node.props ?? {});
      if (parsed.success) {
        return;
      }

      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "MarkdownCards.props must contain cards:[{title,markdown,id?}] and optional title.",
      });
    })
    .passthrough(),
);

export const treeSpecSchema: z.ZodType<TreeSpec> = z.object({
  root: treeNodeSchema,
  state: recordSchema.optional(),
});

export const renderChatUiArgsSchema = z.object({
  spec: treeSpecSchema,
});

export const renderChatUiArgsJsonSchema = z.toJSONSchema(renderChatUiArgsSchema);

function extractMarkdownCards(spec: unknown): MarkdownBoardCardInput[] {
  if (!isObject(spec) || !isObject(spec.root)) {
    return [];
  }

  const cards: MarkdownBoardCardInput[] = [];

  const visit = (node: TreeNode) => {
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
        visit(child);
      });
    }
  };

  visit(spec.root as TreeNode);
  return cards;
}

const flattenIssues = (error: z.ZodError): string[] =>
  error.issues.map((issue) => {
    const path = issue.path.length ? issue.path.join(".") : "spec";
    return `${path}: ${issue.message}`;
  });

function countNodes(node: TreeNode): number {
  if (!Array.isArray(node.children) || node.children.length === 0) {
    return 1;
  }

  return 1 + node.children.reduce((sum, child) => sum + countNodes(child), 0);
}

export function parseRenderSpec(spec: unknown): ParsedRenderSpec {
  const parsed = treeSpecSchema.safeParse(spec);
  if (!parsed.success) {
    return {
      spec: null,
      valid: false,
      issues: flattenIssues(parsed.error),
      warnings: [],
      markdownCards: [],
      summary: {
        rootType: null,
        nodeCount: 0,
      },
    };
  }

  const validatedSpec = parsed.data;
  const nodeCount = countNodes(validatedSpec.root);

  return {
    spec: validatedSpec,
    valid: true,
    issues: [],
    warnings: [],
    markdownCards: extractMarkdownCards(validatedSpec),
    summary: {
      rootType: validatedSpec.root.type,
      nodeCount,
    },
  };
}
