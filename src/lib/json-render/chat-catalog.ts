import { defineCatalog } from "@json-render/core";
import { schema } from "@json-render/react/schema";
import { shadcnComponentDefinitions } from "@json-render/shadcn/catalog";
import { markdownCardsPropsSchema } from "@/lib/json-render/chat-renderer";

export const chatCatalog = defineCatalog(schema, {
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

export const extractAvailableComponentsBlock = (source: string): string => {
  const match = source.match(
    /(AVAILABLE COMPONENTS \(\d+\):[\s\S]*?)(?=\n\n[A-Z][A-Z _()]+:|$)/,
  );
  return match ? match[1].trim() : "";
};
