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

export type AttachmentChatMessage = BaseChatMessage & {
  kind: "attachment";
  mediaType: "image" | "video" | "audio";
  name: string;
  previewUrl: string;
  progress: number;
  status: "streaming" | "done" | "failed";
  error?: string;
};

export type ChatMessage =
  | TextChatMessage
  | ToolChatMessage
  | AltairChatMessage
  | JsonRenderChatMessage
  | AttachmentChatMessage;

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
  streamingUserId: string | null;
  markdownBoard: MarkdownBoardState;
  addUserText: (text: string) => void;
  addUserTranscription: (text: string, isFinal?: boolean) => void;
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
  addUserAttachment: (input: {
    mediaType: "image" | "video" | "audio";
    name: string;
    previewUrl: string;
  }) => string;
  updateAttachmentProgress: (id: string, progress: number) => void;
  finalizeAttachment: (id: string) => void;
  failAttachment: (id: string, error?: string) => void;
  listMarkdownCards: () => {
    cards: Array<{ id: string; title: string }>;
    openCardId: string | null;
    noCardOpen: boolean;
  };
  getMarkdownCard: (cardId: string) => MarkdownBoardCard | null;
  createMarkdownCard: (input: MarkdownBoardCardInput) => MarkdownBoardCard;
  replaceMarkdownCard: (
    cardId: string,
    input: { markdown: string; title?: string },
  ) => MarkdownBoardCard;
  updateMarkdownCard: (cardId: string, markdown: string) => void;
  openMarkdownCard: (cardId: string) => void;
  closeMarkdownCard: () => void;
  removeMarkdownCard: (cardId: string) => void;
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

const buildMarkdownCard = (input: MarkdownBoardCardInput): MarkdownBoardCard => ({
  id: input.id?.trim() || createId(),
  title: input.title.trim(),
  markdown: input.markdown.trim(),
  createdAt: Date.now(),
});

const initialMarkdownBoard = loadMarkdownBoard();

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  streamingAssistantId: null,
  streamingUserId: null,
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
  addUserTranscription: (text, isFinal = false) => {
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }

    set((state) => {
      if (state.streamingUserId) {
        return {
          messages: state.messages.map((message) =>
            message.id === state.streamingUserId && message.kind === "text"
              ? { ...message, text: trimmed, streaming: !isFinal }
              : message,
          ),
          streamingUserId: isFinal ? null : state.streamingUserId,
        };
      }

      const id = createId();
      return {
        streamingUserId: isFinal ? null : id,
        messages: [
          ...state.messages,
          {
            id,
            kind: "text",
            role: "user",
            createdAt: Date.now(),
            text: trimmed,
            streaming: !isFinal,
          },
        ],
      };
    });
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
  addUserAttachment: (input) => {
    const id = createId();
    set((state) => ({
      messages: [
        ...state.messages,
        {
          id,
          kind: "attachment",
          role: "user",
          createdAt: Date.now(),
          mediaType: input.mediaType,
          name: input.name,
          previewUrl: input.previewUrl,
          progress: 0,
          status: "streaming",
        },
      ],
    }));
    return id;
  },
  updateAttachmentProgress: (id, progress) => {
    set((state) => ({
      messages: state.messages.map((message) =>
        message.kind === "attachment" && message.id === id
          ? { ...message, progress: Math.max(0, Math.min(1, progress)) }
          : message,
      ),
    }));
  },
  finalizeAttachment: (id) => {
    set((state) => ({
      messages: state.messages.map((message) =>
        message.kind === "attachment" && message.id === id
          ? { ...message, status: "done", progress: 1, error: undefined }
          : message,
      ),
    }));
  },
  failAttachment: (id, error) => {
    set((state) => ({
      messages: state.messages.map((message) =>
        message.kind === "attachment" && message.id === id
          ? { ...message, status: "failed", error }
          : message,
      ),
    }));
  },
  listMarkdownCards: () => {
    const state = get().markdownBoard;
    return {
      cards: state.cards.map((card) => ({ id: card.id, title: card.title })),
      openCardId: state.activeCardId,
      noCardOpen: state.activeCardId === null,
    };
  },
  getMarkdownCard: (cardId) =>
    get()
      .markdownBoard.cards.find((card) => card.id === cardId) ?? null,
  createMarkdownCard: (input) => {
    const nextCard = buildMarkdownCard(input);
    set((state) => {
      const nextCards = sanitizeCards([...state.markdownBoard.cards, nextCard]);
      persistMarkdownBoard(nextCards);
      return {
        markdownBoard: {
          ...state.markdownBoard,
          cards: nextCards,
        },
      };
    });
    return nextCard;
  },
  replaceMarkdownCard: (cardId, input) => {
    const store = get();
    const existing = store.markdownBoard.cards.find((card) => card.id === cardId);
    if (!existing) {
      throw new Error(`Markdown card '${cardId}' was not found.`);
    }

    const title = input.title?.trim() || existing.title;
    const markdown = input.markdown.trim();
    if (!title || !markdown) {
      throw new Error("Markdown card title and markdown must not be empty.");
    }

    const nextCard = { ...existing, title, markdown };
    set((state) => {
      const nextCards = state.markdownBoard.cards.map((card) =>
        card.id === cardId ? nextCard : card,
      );
      persistMarkdownBoard(nextCards);
      return {
        markdownBoard: {
          ...state.markdownBoard,
          cards: nextCards,
        },
      };
    });
    return nextCard;
  },
  updateMarkdownCard: (cardId, markdown) => {
    set((state) => {
      const nextCards = state.markdownBoard.cards.map((card) =>
        card.id === cardId ? { ...card, markdown } : card,
      );
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
  removeMarkdownCard: (cardId) => {
    set((state) => {
      const nextCards = state.markdownBoard.cards.filter((card) => card.id !== cardId);
      persistMarkdownBoard(nextCards);

      return {
        markdownBoard: {
          ...state.markdownBoard,
          cards: nextCards,
          activeCardId:
            state.markdownBoard.activeCardId === cardId
              ? null
              : state.markdownBoard.activeCardId,
        },
      };
    });
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
      streamingUserId: null,
      markdownBoard: {
        ...state.markdownBoard,
        activeCardId: null,
      },
    })),
}));
