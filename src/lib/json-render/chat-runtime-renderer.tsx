import { defineCatalog, nestedToFlat } from "@json-render/core";
import { JSONUIProvider, Renderer, defineRegistry } from "@json-render/react";
import { schema } from "@json-render/react/schema";
import { shadcnComponents } from "@json-render/shadcn";
import { shadcnComponentDefinitions } from "@json-render/shadcn/catalog";
import { useMemo } from "react";
import { z } from "zod";
import { MarkdownCards, type MarkdownCardItem } from "@/components/chat/MarkdownCards";
import type { TreeSpec } from "@/lib/json-render/chat-renderer";

const markdownCardsPropsSchema = z.object({
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

const chatCatalog = defineCatalog(schema, {
  components: {
    Card: shadcnComponentDefinitions.Card,
    Stack: shadcnComponentDefinitions.Stack,
    Heading: shadcnComponentDefinitions.Heading,
    Text: shadcnComponentDefinitions.Text,
    Badge: shadcnComponentDefinitions.Badge,
    Separator: shadcnComponentDefinitions.Separator,
    Table: shadcnComponentDefinitions.Table,
    Alert: shadcnComponentDefinitions.Alert,
    MarkdownCards: {
      props: markdownCardsPropsSchema,
      description: "Markdown cards grid with modal expansion.",
    },
  },
  actions: {},
});

const compactSection = (
  source: string,
  startMarker: string,
  endMarker?: string,
): string => {
  const start = source.indexOf(startMarker);
  if (start === -1) {
    return "";
  }

  const fromStart = source.slice(start);
  if (!endMarker) {
    return fromStart.trim();
  }

  const end = fromStart.indexOf(endMarker);
  if (end === -1) {
    return fromStart.trim();
  }

  return fromStart.slice(0, end).trim();
};

export const buildRenderChatUiInstruction = (): string => {
  const fullPrompt = chatCatalog.prompt();
  const componentsSection = compactSection(
    fullPrompt,
    "AVAILABLE COMPONENTS",
    "AVAILABLE ACTIONS",
  );

  return [
    "render_chat_ui tool contract:",
    "- Call the tool with a single object argument: { spec: { root: ... } }.",
    "- Do not print raw JSONL patch lines in normal chat text.",
    "- Prefer concise, readable specs; keep only content relevant to the user request.",
    "- For markdown knowledge cards, use component type MarkdownCards with cards:[{id?,title,markdown}].",
    componentsSection,
  ]
    .filter(Boolean)
    .join("\n\n");
};

const { registry: chatRegistry } = defineRegistry(chatCatalog, {
  components: {
    Card: shadcnComponents.Card,
    Stack: shadcnComponents.Stack,
    Heading: shadcnComponents.Heading,
    Text: shadcnComponents.Text,
    Badge: shadcnComponents.Badge,
    Separator: shadcnComponents.Separator,
    Table: shadcnComponents.Table,
    Alert: shadcnComponents.Alert,
    MarkdownCards: (componentProps: {
      props: {
        title?: string | null;
        cards: Array<{ id?: string | null; title: string; markdown: string }>;
      };
    }) => (
      <MarkdownCards
        title={
          typeof componentProps.props.title === "string"
            ? componentProps.props.title
            : undefined
        }
        cards={componentProps.props.cards.map((card) => ({
          ...card,
          id: card.id ?? undefined,
        })) as MarkdownCardItem[]}
      />
    ),
  },
});

type FlatSpec = {
  root: string;
  elements: Record<string, unknown>;
  state?: Record<string, unknown>;
};

function toFlatSpec(spec: TreeSpec): FlatSpec {
  const flat = nestedToFlat(spec.root as Record<string, unknown>) as FlatSpec;
  if (spec.state && typeof spec.state === "object") {
    return { ...flat, state: spec.state };
  }
  return flat;
}

type ChatSpecRendererProps = {
  spec: TreeSpec;
};

export function ChatSpecRenderer({ spec }: ChatSpecRendererProps) {
  const flatSpec = useMemo(() => toFlatSpec(spec), [spec]);
  return (
    <JSONUIProvider registry={chatRegistry}>
      <Renderer spec={flatSpec as never} registry={chatRegistry} />
    </JSONUIProvider>
  );
}
