import {
  AnimatePresence,
  LayoutGroup,
  motion,
  useReducedMotion,
} from "framer-motion";
import { Trash2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useMemo } from "react";
import { useChatStore } from "@/lib/chat/store";

const previewText = (markdown: string, maxChars: number = 160) => {
  const normalized = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/#+\s?/g, "")
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/\[(.*?)\]\((.*?)\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) {
    return "No preview available.";
  }

  if (normalized.length <= maxChars) {
    return normalized;
  }

  return `${normalized.slice(0, maxChars).trimEnd()}...`;
};

export function MarkdownBoardPanel() {
  const { cards, activeCardId } = useChatStore((state) => state.markdownBoard);
  const openMarkdownCard = useChatStore((state) => state.openMarkdownCard);
  const closeMarkdownCard = useChatStore((state) => state.closeMarkdownCard);
  const removeMarkdownCard = useChatStore((state) => state.removeMarkdownCard);
  const shouldReduceMotion = useReducedMotion();

  const activeCard = useMemo(
    () => cards.find((card) => card.id === activeCardId) ?? null,
    [cards, activeCardId],
  );

  const handleCloseCard = () => closeMarkdownCard();

  return (
    <motion.section
      layoutScroll
      className="h-full w-screen shrink-0 overflow-y-auto bg-gradient-to-br from-[#f5f7fb] via-[#f4fbf8] to-[#eef5ff] px-5 pb-36 pt-6 md:px-8"
    >
      <div className="mx-auto w-full max-w-6xl">
        <div className="mb-4 mt-2 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold text-zinc-900">Card Board</h2>
          </div>
        </div>

        <LayoutGroup id="markdown-board-cards">
          {cards.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-300 bg-white/70 px-6 py-14 text-center text-sm text-zinc-500">
              No markdown cards yet. The assistant can add cards using
              <span className="ml-1 font-semibold text-zinc-700">
                render_ui
              </span>
              .
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {cards.map((card) => {
                const cardLayoutId = `markdown-card-${card.id}`;
                return (
                  <motion.article
                    key={card.id}
                    layoutId={shouldReduceMotion ? undefined : cardLayoutId}
                    transition={{
                      layout: { duration: 0.12, ease: [0.4, 0, 0.2, 1] },
                    }}
                    onClick={(event) => {
                      const target = event.target as HTMLElement;
                      if (target.closest("[data-card-action='delete']")) {
                        return;
                      }
                      openMarkdownCard(card.id);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openMarkdownCard(card.id);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    style={{
                      visibility:
                        activeCardId === card.id ? "hidden" : "visible",
                    }}
                    className="group relative cursor-pointer rounded-2xl border border-zinc-200 bg-white p-4 text-left shadow-sm transition-shadow duration-200 hover:shadow-lg"
                  >
                    <button
                      type="button"
                      data-card-action="delete"
                      aria-label={`Delete ${card.title}`}
                      onPointerDown={(event) => {
                        event.stopPropagation();
                      }}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        removeMarkdownCard(card.id);
                      }}
                      className="absolute right-3 top-3 z-20 rounded-md p-1 text-zinc-400 opacity-0 transition hover:bg-zinc-100 hover:text-red-600 focus-visible:opacity-100 group-hover:opacity-100"
                    >
                      <Trash2 size={14} />
                    </button>
                    <div className="transition-transform duration-200 group-hover:scale-101">
                      <h3 className="line-clamp-2 text-base font-semibold text-zinc-900">
                        {card.title}
                      </h3>
                      <p className="mt-2 line-clamp-4 text-sm text-zinc-600">
                        {previewText(card.markdown)}
                      </p>
                      <p className="mt-4 text-xs font-medium text-zinc-500 group-hover:text-zinc-800">
                        Open card
                      </p>
                    </div>
                  </motion.article>
                );
              })}
            </div>
          )}

          <AnimatePresence initial={false}>
            {activeCard ? (
              <motion.div
                key="markdown-overlay"
                layoutRoot
                className="fixed inset-0 z-50"
                initial={{ opacity: 1 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 1 }}
              >
                <motion.div
                  key="markdown-backdrop"
                  className="absolute inset-0 bg-black/45"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.08, ease: "easeOut" }}
                  onClick={handleCloseCard}
                />
                <div className="absolute inset-0 flex items-center justify-center p-4 pointer-events-none">
                  <motion.article
                    layoutId={
                      shouldReduceMotion
                        ? undefined
                        : `markdown-card-${activeCard.id}`
                    }
                    className="pointer-events-auto max-h-[85vh] w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl"
                    transition={{
                      layout: { duration: 0.22, ease: [0.22, 1, 0.36, 1] },
                    }}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <header className="flex items-center justify-between border-b border-zinc-200 px-5 py-4">
                      <h3 className="text-lg font-semibold text-zinc-900">
                        {activeCard.title}
                      </h3>
                      <button
                        type="button"
                        onClick={handleCloseCard}
                        className="rounded-md px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
                      >
                        Close
                      </button>
                    </header>

                    <div className="max-h-[calc(85vh-72px)] overflow-y-auto px-5 py-4">
                      <article className="markdown-content text-sm leading-6 text-zinc-800">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {activeCard.markdown}
                        </ReactMarkdown>
                      </article>
                    </div>
                  </motion.article>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </LayoutGroup>
      </div>
    </motion.section>
  );
}
