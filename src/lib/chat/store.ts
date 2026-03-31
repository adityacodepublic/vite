import { create } from "zustand";
import type { TreeSpec } from "@/lib/json-render/chat-renderer";

const MARKDOWN_BOARD_LIMIT = 50;
const MARKDOWN_BOARD_STORAGE_KEY = "chat-markdown-board-v1";

type BaseChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  createdAt: number;
};

export type TextChatMessage = BaseChatMessage & {
  kind: "text";
  text: string;
  streaming?: boolean;
};

export type ToolChatMessage = BaseChatMessage & {
  kind: "tool";
  name: string;
  output: unknown;
};

export type AltairChatMessage = BaseChatMessage & {
  kind: "altair";
  specJson: string;
};

export type JsonRenderChatMessage = BaseChatMessage & {
  kind: "json-render";
  spec: TreeSpec | null;
  valid: boolean;
  issues: string[];
  warnings: string[];
};

export type ChatMessage =
  | TextChatMessage
  | ToolChatMessage
  | AltairChatMessage
  | JsonRenderChatMessage;

export type MarkdownBoardCard = {
  id: string;
  title: string;
  markdown: string;
  createdAt: number;
};

export type MarkdownBoardCardInput = {
  id?: string;
  title: string;
  markdown: string;
};

type MarkdownBoardState = {
  cards: MarkdownBoardCard[];
  activeCardId: string | null;
};

type ChatState = {
  messages: ChatMessage[];
  streamingAssistantId: string | null;
  markdownBoard: MarkdownBoardState;
  addUserText: (text: string) => void;
  addAssistantTextChunk: (text: string) => void;
  finalizeAssistantText: () => void;
  addToolResult: (name: string, output: unknown) => void;
  addAltairSpec: (specJson: string) => void;
  addJsonRenderSpec: (
    spec: TreeSpec | null,
    valid: boolean,
    issues?: string[],
    warnings?: string[],
  ) => void;
  addSystemMessage: (text: string) => void;
  upsertMarkdownCards: (cards: MarkdownBoardCardInput[]) => void;
  openMarkdownCard: (cardId: string) => void;
  closeMarkdownCard: () => void;
  clearMarkdownBoard: () => void;
  reset: () => void;
};

type PersistedMarkdownBoard = {
  version: number;
  cards: MarkdownBoardCard[];
};

const createId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const emptyMarkdownBoard: MarkdownBoardState = {
  cards: [],
  activeCardId: null,
};

const isBrowser = () => typeof window !== "undefined";

const sanitizeCards = (cards: MarkdownBoardCard[]) =>
  cards
    .filter((card) => card.title.trim() && card.markdown.trim())
    .map((card) => ({
      ...card,
      title: card.title.trim(),
      markdown: card.markdown.trim(),
    }))
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(-MARKDOWN_BOARD_LIMIT);

const loadMarkdownBoard = (): MarkdownBoardState => {
  if (!isBrowser()) {
    return emptyMarkdownBoard;
  }

  try {
    const raw = window.localStorage.getItem(MARKDOWN_BOARD_STORAGE_KEY);
    if (!raw) {
      return emptyMarkdownBoard;
    }

    const parsed = JSON.parse(raw) as PersistedMarkdownBoard;
    if (parsed.version !== 1 || !Array.isArray(parsed.cards)) {
      return emptyMarkdownBoard;
    }

    return {
      cards: sanitizeCards(parsed.cards),
      activeCardId: null,
    };
  } catch {
    return emptyMarkdownBoard;
  }
};

const persistMarkdownBoard = (cards: MarkdownBoardCard[]) => {
  if (!isBrowser()) {
    return;
  }

  const payload: PersistedMarkdownBoard = {
    version: 1,
    cards: sanitizeCards(cards),
  };

  window.localStorage.setItem(MARKDOWN_BOARD_STORAGE_KEY, JSON.stringify(payload));
};

const createMarkdownCard = (input: MarkdownBoardCardInput): MarkdownBoardCard => ({
  id: input.id?.trim() || createId(),
  title: input.title.trim(),
  markdown: input.markdown.trim(),
  createdAt: Date.now(),
});

const initialMarkdownBoard = loadMarkdownBoard();

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  streamingAssistantId: null,
  markdownBoard: initialMarkdownBoard,
  addUserText: (text) => {
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }

    set((state) => ({
      messages: [
        ...state.messages,
        {
          id: createId(),
          kind: "text",
          role: "user",
          createdAt: Date.now(),
          text: trimmed,
        },
      ],
    }));
  },
  addAssistantTextChunk: (text) => {
    if (!text) {
      return;
    }

    set((state) => {
      if (state.streamingAssistantId) {
        return {
          messages: state.messages.map((message) =>
            message.id === state.streamingAssistantId && message.kind === "text"
              ? { ...message, text: `${message.text}${text}` }
              : message,
          ),
        };
      }

      const id = createId();
      return {
        streamingAssistantId: id,
        messages: [
          ...state.messages,
          {
            id,
            kind: "text",
            role: "assistant",
            createdAt: Date.now(),
            text,
            streaming: true,
          },
        ],
      };
    });
  },
  finalizeAssistantText: () => {
    set((state) => {
      if (!state.streamingAssistantId) {
        return state;
      }

      return {
        streamingAssistantId: null,
        messages: state.messages.map((message) =>
          message.id === state.streamingAssistantId && message.kind === "text"
            ? { ...message, streaming: false }
            : message,
        ),
      };
    });
  },
  addToolResult: (name, output) => {
    set((state) => ({
      messages: [
        ...state.messages,
        {
          id: createId(),
          kind: "tool",
          role: "assistant",
          createdAt: Date.now(),
          name,
          output,
        },
      ],
    }));
  },
  addAltairSpec: (specJson) => {
    set((state) => ({
      messages: [
        ...state.messages,
        {
          id: createId(),
          kind: "altair",
          role: "assistant",
          createdAt: Date.now(),
          specJson,
        },
      ],
    }));
  },
  addJsonRenderSpec: (spec, valid, issues = [], warnings = []) => {
    set((state) => ({
      messages: [
        ...state.messages,
        {
          id: createId(),
          kind: "json-render",
          role: "assistant",
          createdAt: Date.now(),
          spec,
          valid,
          issues,
          warnings,
        },
      ],
    }));
  },
  addSystemMessage: (text) => {
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }

    set((state) => ({
      messages: [
        ...state.messages,
        {
          id: createId(),
          kind: "text",
          role: "system",
          createdAt: Date.now(),
          text: trimmed,
        },
      ],
    }));
  },
  upsertMarkdownCards: (cards) => {
    const normalized = cards
      .map((card) => createMarkdownCard(card))
      .filter((card) => card.title && card.markdown);

    if (!normalized.length) {
      return;
    }

    set((state) => {
      const byId = new Map(state.markdownBoard.cards.map((card) => [card.id, card]));

      normalized.forEach((card) => {
        const existing = byId.get(card.id);
        byId.set(card.id, {
          ...(existing ?? card),
          ...card,
          createdAt: existing?.createdAt ?? card.createdAt,
        });
      });

      const nextCards = sanitizeCards([...byId.values()]);
      persistMarkdownBoard(nextCards);

      return {
        markdownBoard: {
          ...state.markdownBoard,
          cards: nextCards,
        },
      };
    });
  },
  openMarkdownCard: (cardId) => {
    set((state) => ({
      markdownBoard: {
        ...state.markdownBoard,
        activeCardId: cardId,
      },
    }));
  },
  closeMarkdownCard: () => {
    set((state) => ({
      markdownBoard: {
        ...state.markdownBoard,
        activeCardId: null,
      },
    }));
  },
  clearMarkdownBoard: () => {
    persistMarkdownBoard([]);
    set((state) => ({
      markdownBoard: {
        ...state.markdownBoard,
        cards: [],
        activeCardId: null,
      },
    }));
  },
  reset: () =>
    set((state) => ({
      messages: [],
      streamingAssistantId: null,
      markdownBoard: {
        ...state.markdownBoard,
        activeCardId: null,
      },
    })),
}));
