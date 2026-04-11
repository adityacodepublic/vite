import { AnimatePresence, motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { useMemo, useState } from "react";

export type MarkdownCardItem = {
  id?: string;
  title: string;
  markdown: string;
};

type MarkdownCardsProps = {
  title?: string;
  cards: MarkdownCardItem[];
};

export function MarkdownCards({ title, cards }: MarkdownCardsProps) {
  const [activeCardId, setActiveCardId] = useState<string | null>(null);

  const normalizedCards = useMemo(
    () =>
      cards
        .map((card, index) => ({
          id: card.id?.trim() || `md-card-${index}`,
          title: card.title?.trim(),
          markdown: card.markdown?.trim(),
        }))
        .filter((card) => card.title && card.markdown),
    [cards],
  );

  const activeCard =
    normalizedCards.find((card) => card.id === activeCardId) ?? null;

  if (!normalizedCards.length) {
    return null;
  }

  return (
    <section className="space-y-3">
      {title ? <h3 className="text-lg font-semibold text-zinc-900">{title}</h3> : null}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {normalizedCards.map((card) => (
          <button
            key={card.id}
            type="button"
            onClick={() => setActiveCardId(card.id)}
            className="rounded-xl border border-zinc-200 bg-white p-3 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
          >
            <p className="line-clamp-2 text-sm font-semibold text-zinc-900">{card.title}</p>
            <div className="relative mt-1 max-h-24 overflow-hidden [mask-image:linear-gradient(to_bottom,black_78%,transparent_100%)]">
              <article className="markdown-content markdown-content--compact text-xs leading-5 text-zinc-600">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm, remarkMath, remarkBreaks]}
                  rehypePlugins={[rehypeKatex, rehypeHighlight]}
                >
                  {card.markdown}
                </ReactMarkdown>
              </article>
            </div>
          </button>
        ))}
      </div>

      <AnimatePresence>
        {activeCard ? (
          <motion.div
            className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setActiveCardId(null)}
          >
            <motion.article
              className="max-h-[80vh] w-full max-w-2xl overflow-hidden rounded-xl bg-white shadow-2xl"
              initial={{ opacity: 0, y: 18, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
              onClick={(event) => event.stopPropagation()}
            >
              <header className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
                <h4 className="text-base font-semibold text-zinc-900">{activeCard.title}</h4>
                <button
                  type="button"
                  className="rounded-md px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
                  onClick={() => setActiveCardId(null)}
                >
                  Close
                </button>
              </header>
              <div className="max-h-[calc(80vh-62px)] overflow-y-auto px-4 py-3">
                <article className="markdown-content text-sm leading-6 text-zinc-800">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm, remarkMath, remarkBreaks]}
                    rehypePlugins={[rehypeKatex, rehypeHighlight]}
                  >
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
