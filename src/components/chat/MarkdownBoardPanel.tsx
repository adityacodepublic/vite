import { AnimatePresence, motion } from "framer-motion";
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

  const activeCard = useMemo(
    () => cards.find((card) => card.id === activeCardId) ?? null,
    [cards, activeCardId],
  );

  return (
    <section className="h-full w-screen shrink-0 overflow-y-auto bg-gradient-to-br from-[#f5f7fb] via-[#f4fbf8] to-[#eef5ff] px-5 pb-36 pt-6 md:px-8">
      <div className="mx-auto w-full max-w-6xl">
        <div className="mb-4 mt-2 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold text-zinc-900">Card Board</h2>
          </div>
          {/* <p className="rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-zinc-600 shadow-sm">
            {cards.length} / 50
          </p> */}
        </div>

        {cards.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-300 bg-white/70 px-6 py-14 text-center text-sm text-zinc-500">
            No markdown cards yet. The assistant can add cards using
            <span className="ml-1 font-semibold text-zinc-700">
              render_chat_ui
            </span>
            .
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {cards.map((card) => (
              <article
                key={card.id}
                onClick={() => openMarkdownCard(card.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openMarkdownCard(card.id);
                  }
                }}
                role="button"
                tabIndex={0}
                className="group relative cursor-pointer rounded-2xl border border-zinc-200 bg-white p-4 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
              >
                <button
                  type="button"
                  aria-label={`Delete ${card.title}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    removeMarkdownCard(card.id);
                  }}
                  className="absolute right-3 top-3 rounded-md p-1 text-zinc-400 opacity-0 transition hover:bg-zinc-100 hover:text-red-600 focus-visible:opacity-100 group-hover:opacity-100"
                >
                  <Trash2 size={14} />
                </button>
                <h3 className="line-clamp-2 text-base font-semibold text-zinc-900">
                  {card.title}
                </h3>
                <p className="mt-2 line-clamp-4 text-sm text-zinc-600">
                  {previewText(card.markdown)}
                </p>
                <p className="mt-4 text-xs font-medium text-zinc-500 group-hover:text-zinc-800">
                  Open card
                </p>
              </article>
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {activeCard ? (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeMarkdownCard}
          >
            <motion.article
              className="max-h-[85vh] w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl"
              initial={{ opacity: 0, y: 24, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              transition={{ duration: 0.24, ease: "easeOut" }}
              onClick={(event) => event.stopPropagation()}
            >
              <header className="flex items-center justify-between border-b border-zinc-200 px-5 py-4">
                <h3 className="text-lg font-semibold text-zinc-900">
                  {activeCard.title}
                </h3>
                <button
                  type="button"
                  onClick={closeMarkdownCard}
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
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}
