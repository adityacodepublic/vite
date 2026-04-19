import { z } from "zod";

export const ALLOWED_COMPONENTS = [
  "Card",
  "Stack",
  "Heading",
  "Text",
  "Badge",
  "Separator",
  "Table",
  "Alert",
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
  summary: {
    rootType: string | null;
    nodeCount: number;
  };
};

const componentTypeSchema = z.enum(ALLOWED_COMPONENTS);

const recordSchema = z.record(z.string(), z.unknown());

const treeNodeSchema: z.ZodType<TreeNode> = z.lazy(() =>
  z
    .object({
      type: componentTypeSchema,
      props: recordSchema.optional(),
      children: z
        .array(treeNodeSchema)
        .nullable()
        .optional()
        .transform((value) => value ?? undefined),
    })
    .passthrough(),
);

export const treeSpecSchema: z.ZodType<TreeSpec> = z.object({
  root: treeNodeSchema,
  state: recordSchema
    .nullable()
    .optional()
    .transform((value) => value ?? undefined),
});

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
    summary: {
      rootType: validatedSpec.root.type,
      nodeCount,
    },
  };
}
