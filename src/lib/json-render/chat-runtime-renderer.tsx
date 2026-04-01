import { nestedToFlat } from "@json-render/core";
import { JSONUIProvider, Renderer, defineRegistry } from "@json-render/react";
import { shadcnComponents } from "@json-render/shadcn";
import { useMemo } from "react";
import { MarkdownCards, type MarkdownCardItem } from "@/components/chat/MarkdownCards";
import { chatCatalog } from "@/lib/json-render/chat-catalog";
import type { TreeSpec } from "@/lib/json-render/chat-renderer";

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
