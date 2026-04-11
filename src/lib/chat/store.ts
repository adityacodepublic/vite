import { create } from "zustand";
import type { TreeSpec } from "@/lib/json-render/chat-renderer";

const MARKDOWN_BOARD_LIMIT = 50;
const MARKDOWN_BOARD_STORAGE_KEY = "chat-markdown-board-v1";
const CAMERA_MARKDOWN_STORAGE_KEY = "chat-camera-markdown-v1";

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

export type CameraMarkdownState = {
  title: string;
  markdown: string;
  isOpen: boolean;
};

type ChatState = {
  messages: ChatMessage[];
  streamingAssistantId: string | null;
  markdownBoard: MarkdownBoardState;
  cameraMarkdown: CameraMarkdownState;
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
  addUserAttachment: (input: {
    mediaType: "image" | "video" | "audio";
    name: string;
    previewUrl: string;
  }) => string;
  updateAttachmentProgress: (id: string, progress: number) => void;
  finalizeAttachment: (id: string) => void;
  failAttachment: (id: string, error?: string) => void;
  upsertMarkdownCards: (cards: MarkdownBoardCardInput[]) => void;
  updateMarkdownCard: (cardId: string, markdown: string) => void;
  openMarkdownCard: (cardId: string) => void;
  closeMarkdownCard: () => void;
  removeMarkdownCard: (cardId: string) => void;
  clearMarkdownBoard: () => void;
  openCameraMarkdown: () => void;
  closeCameraMarkdown: () => void;
  updateCameraMarkdown: (markdown: string) => void;
  updateCameraMarkdownTitle: (title: string) => void;
  reset: () => void;
};

type PersistedMarkdownBoard = {
  version: number;
  cards: MarkdownBoardCard[];
};

type PersistedCameraMarkdown = {
  version: number;
  title: string;
  markdown: string;
};

const createId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const emptyMarkdownBoard: MarkdownBoardState = {
  cards: [],
  activeCardId: null,
};

const defaultCameraMarkdown: CameraMarkdownState = {
  title: "Camera Markdown",
  markdown: "",
  isOpen: false,
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

const loadCameraMarkdown = (): CameraMarkdownState => {
  if (!isBrowser()) {
    return defaultCameraMarkdown;
  }

  try {
    const raw = window.localStorage.getItem(CAMERA_MARKDOWN_STORAGE_KEY);
    if (!raw) {
      return defaultCameraMarkdown;
    }

    const parsed = JSON.parse(raw) as PersistedCameraMarkdown;
    if (
      parsed.version !== 1 ||
      typeof parsed.title !== "string" ||
      typeof parsed.markdown !== "string"
    ) {
      return defaultCameraMarkdown;
    }

    return {
      title: parsed.title.trim() || defaultCameraMarkdown.title,
      markdown: parsed.markdown,
      isOpen: false,
    };
  } catch {
    return defaultCameraMarkdown;
  }
};

const persistCameraMarkdown = (state: CameraMarkdownState) => {
  if (!isBrowser()) {
    return;
  }

  const payload: PersistedCameraMarkdown = {
    version: 1,
    title: state.title.trim() || defaultCameraMarkdown.title,
    markdown: state.markdown,
  };

  window.localStorage.setItem(CAMERA_MARKDOWN_STORAGE_KEY, JSON.stringify(payload));
};

const createMarkdownCard = (input: MarkdownBoardCardInput): MarkdownBoardCard => ({
  id: input.id?.trim() || createId(),
  title: input.title.trim(),
  markdown: input.markdown.trim(),
  createdAt: Date.now(),
});

const initialMarkdownBoard = loadMarkdownBoard();
const initialCameraMarkdown = loadCameraMarkdown();

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  streamingAssistantId: null,
  markdownBoard: initialMarkdownBoard,
  cameraMarkdown: initialCameraMarkdown,
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
  openCameraMarkdown: () => {
    set((state) => ({
      cameraMarkdown: {
        ...state.cameraMarkdown,
        isOpen: true,
      },
    }));
  },
  closeCameraMarkdown: () => {
    set((state) => ({
      cameraMarkdown: {
        ...state.cameraMarkdown,
        isOpen: false,
      },
    }));
  },
  updateCameraMarkdown: (markdown) => {
    set((state) => {
      const nextCameraMarkdown = {
        ...state.cameraMarkdown,
        markdown,
      };
      persistCameraMarkdown(nextCameraMarkdown);

      return {
        cameraMarkdown: nextCameraMarkdown,
      };
    });
  },
  updateCameraMarkdownTitle: (title) => {
    set((state) => {
      const nextCameraMarkdown = {
        ...state.cameraMarkdown,
        title: title.trim() || defaultCameraMarkdown.title,
      };
      persistCameraMarkdown(nextCameraMarkdown);

      return {
        cameraMarkdown: nextCameraMarkdown,
      };
    });
  },
  reset: () =>
    set((state) => ({
      messages: [],
      streamingAssistantId: null,
      markdownBoard: {
        ...state.markdownBoard,
        activeCardId: null,
      },
      cameraMarkdown: {
        ...state.cameraMarkdown,
        isOpen: false,
      },
    })),
}));
