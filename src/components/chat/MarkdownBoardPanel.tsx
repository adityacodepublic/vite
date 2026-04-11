import {
  AnimatePresence,
  LayoutGroup,
  motion,
  useReducedMotion,
} from "framer-motion";
import { Download, Trash2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { RefObject, useEffect, useMemo, useRef, useState } from "react";
import type { ControlTrayHandle } from "@/components/control-tray/ControlTray";
import { useLiveAPIContext } from "@/contexts/LiveAPIContext";
import {
  downloadMarkdownAsPdf,
  downloadMarkdownAsWord,
} from "@/lib/chat/markdown-export";
import { useChatStore } from "@/lib/chat/store";
import { EditableMarkdownContent } from "./EditableMarkdownContent";

type MarkdownBoardPanelProps = {
  videoStream: MediaStream | null;
  controlTrayRef: RefObject<ControlTrayHandle | null>;
};

export function MarkdownBoardPanel({
  videoStream,
  controlTrayRef,
}: MarkdownBoardPanelProps) {
  const { client, connected } = useLiveAPIContext();
  const { cards, activeCardId } = useChatStore((state) => state.markdownBoard);
  const cameraMarkdown = useChatStore((state) => state.cameraMarkdown);
  const openMarkdownCard = useChatStore((state) => state.openMarkdownCard);
  const closeMarkdownCard = useChatStore((state) => state.closeMarkdownCard);
  const removeMarkdownCard = useChatStore((state) => state.removeMarkdownCard);
  const updateMarkdownCard = useChatStore((state) => state.updateMarkdownCard);
  const openCameraMarkdown = useChatStore((state) => state.openCameraMarkdown);
  const closeCameraMarkdown = useChatStore(
    (state) => state.closeCameraMarkdown,
  );
  const updateCameraMarkdown = useChatStore(
    (state) => state.updateCameraMarkdown,
  );
  const shouldReduceMotion = useReducedMotion();
  const cameraVideoRef = useRef<HTMLVideoElement>(null);
  const modalOpenedWebcamRef = useRef(false);
  const activeCardContentRef = useRef<HTMLDivElement>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [isExportingWord, setIsExportingWord] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  const activeCard = useMemo(
    () => cards.find((card) => card.id === activeCardId) ?? null,
    [cards, activeCardId],
  );

  const handleCloseCard = () => {
    setIsExportMenuOpen(false);
    closeMarkdownCard();
  };

  const handleOpenCameraMarkdown = () => {
    void controlTrayRef.current?.prepareCameraFrameLogging();
    openCameraMarkdown();
  };

  const handleDownloadWord = async () => {
    if (!activeCard || isExportingWord) {
      return;
    }

    setIsExportingWord(true);
    try {
      await downloadMarkdownAsWord({
        title: activeCard.title,
        markdown: activeCard.markdown,
      });
      setIsExportMenuOpen(false);
    } catch (error) {
      console.error("Failed to export DOCX", error);
    } finally {
      setIsExportingWord(false);
    }
  };

  const handleCloseCameraMarkdown = () => {
    if (connected) {
      client.sendRealtimeText(
        "camera markdown component is closed by the user. This is only to inform you. Do not acknowledge or reply. or you can reply with 'Now what would you like to do next?'",
      );
    }
    closeCameraMarkdown();
    if (modalOpenedWebcamRef.current) {
      controlTrayRef.current?.stopWebcam();
      modalOpenedWebcamRef.current = false;
    }
  };

  const handleDownloadPdf = async () => {
    if (!activeCard || !activeCardContentRef.current || isExportingPdf) {
      return;
    }

    setIsExportingPdf(true);
    try {
      await downloadMarkdownAsPdf({
        title: activeCard.title,
        contentElement: activeCardContentRef.current,
      });
      setIsExportMenuOpen(false);
    } catch (error) {
      console.error("Failed to export PDF", error);
    } finally {
      setIsExportingPdf(false);
    }
  };

  useEffect(() => {
    const video = cameraVideoRef.current;
    if (!video) {
      return;
    }

    video.srcObject = videoStream;
  }, [videoStream]);

  useEffect(() => {
    if (!cameraMarkdown.isOpen) {
      return;
    }

    let cancelled = false;

    const ensureLiveMode = async () => {
      modalOpenedWebcamRef.current = false;
      const tray = controlTrayRef.current;
      if (!tray) {
        return;
      }

      if (!tray.isConnected()) {
        const didConnect = await tray.connectVoiceMode();
        if (!didConnect || cancelled) {
          return;
        }
      }

      if (cancelled) {
        return;
      }

      client.sendRealtimeText(
        "camera markdown component is opened by the user dont reply, as this is a system message. This is only to inform you. Use capture_snapshot when the user asks you to inspect what is shown, prefer accurate scanning, and ask for repositioning if needed. Just reply with 'Ready to scan !'.",
      );

      if (!tray.isWebcamStreaming()) {
        const started = await tray.startWebcam();
        if (!cancelled) {
          modalOpenedWebcamRef.current = started;
        }
      }
    };

    void ensureLiveMode();

    return () => {
      cancelled = true;
    };
  }, [cameraMarkdown.isOpen, client, controlTrayRef]);

  useEffect(() => {
    setIsExportMenuOpen(false);
  }, [activeCardId]);

  useEffect(() => {
    if (!isExportMenuOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!exportMenuRef.current?.contains(event.target as Node)) {
        setIsExportMenuOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsExportMenuOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isExportMenuOpen]);

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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <motion.article
              layoutId={shouldReduceMotion ? undefined : "camera-markdown-card"}
              transition={{
                layout: { duration: 0.12, ease: [0.4, 0, 0.2, 1] },
              }}
              onClick={() => {
                handleOpenCameraMarkdown();
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  handleOpenCameraMarkdown();
                }
              }}
              role="button"
              tabIndex={0}
              style={{
                visibility: cameraMarkdown.isOpen ? "hidden" : "visible",
              }}
              className="group relative cursor-pointer rounded-2xl border border-sky-200 bg-linear-to-br from-white via-sky-50 to-emerald-50 p-4 text-left shadow-sm transition-shadow duration-200 hover:shadow-lg"
            >
              <div className="transition-transform duration-200 group-hover:scale-101">
                <h3 className="line-clamp-2 text-base font-semibold text-zinc-900">
                  {cameraMarkdown.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-zinc-600">
                  Open camera-assisted markdown workspace
                </p>
                <p className="mt-4 text-xs font-medium text-zinc-500 group-hover:text-zinc-800">
                  Open workspace
                </p>
              </div>
            </motion.article>

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
                    visibility: activeCardId === card.id ? "hidden" : "visible",
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
                    <div className="relative mt-2 max-h-28 overflow-hidden [mask-image:linear-gradient(to_bottom,black_78%,transparent_100%)]">
                      <article className="markdown-content markdown-content--compact text-sm leading-6 text-zinc-600">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm, remarkMath, remarkBreaks]}
                          rehypePlugins={[rehypeKatex, rehypeHighlight]}
                        >
                          {card.markdown}
                        </ReactMarkdown>
                      </article>
                    </div>
                    <p className="mt-4 text-xs font-medium text-zinc-500 group-hover:text-zinc-800">
                      Open card
                    </p>
                  </div>
                </motion.article>
              );
            })}
          </div>

          {cards.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-dashed border-zinc-300 bg-white/70 px-6 py-8 text-center text-sm text-zinc-500">
              No markdown cards yet. The assistant can add cards using
              <span className="ml-1 font-semibold text-zinc-700">
                render_ui
              </span>
              .
            </div>
          ) : null}

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
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4">
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
                      <div className="flex items-center gap-2">
                        <div className="relative" ref={exportMenuRef}>
                          <button
                            type="button"
                            aria-label="Download options"
                            aria-haspopup="menu"
                            aria-expanded={isExportMenuOpen}
                            onClick={() => setIsExportMenuOpen((open) => !open)}
                            className="inline-flex items-center rounded-md p-2 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
                          >
                            <Download size={14} />
                          </button>

                          {isExportMenuOpen ? (
                            <div
                              role="menu"
                              className="absolute right-0 top-9 z-20 min-w-40 rounded-lg border border-zinc-200 bg-white p-1 shadow-xl"
                            >
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() => {
                                  void handleDownloadWord();
                                }}
                                disabled={isExportingWord}
                                className="block w-full rounded-md px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:text-zinc-400"
                              >
                                {isExportingWord
                                  ? "Preparing DOCX..."
                                  : "Download DOCX"}
                              </button>
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() => {
                                  void handleDownloadPdf();
                                }}
                                disabled={isExportingPdf}
                                className="block w-full rounded-md px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:text-zinc-400"
                              >
                                {isExportingPdf
                                  ? "Preparing PDF..."
                                  : "Download PDF"}
                              </button>
                            </div>
                          ) : null}
                        </div>

                        <button
                          type="button"
                          onClick={handleCloseCard}
                          className="rounded-md px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
                        >
                          Close
                        </button>
                      </div>
                    </header>

                    <div
                      ref={activeCardContentRef}
                      className="max-h-[calc(85vh-72px)] overflow-y-auto px-5 py-4"
                    >
                      <EditableMarkdownContent
                        className="markdown-content text-sm leading-6 text-zinc-800"
                        markdown={activeCard.markdown}
                        onChange={(nextMarkdown) => {
                          updateMarkdownCard(activeCard.id, nextMarkdown);
                        }}
                      />
                    </div>
                  </motion.article>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>

          <AnimatePresence initial={false}>
            {cameraMarkdown.isOpen ? (
              <motion.div
                key="camera-markdown-overlay"
                layoutRoot
                className="fixed inset-0 z-50"
                initial={{ opacity: 1 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 1 }}
              >
                <motion.div
                  key="camera-markdown-backdrop"
                  className="absolute inset-0 bg-black/45"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.08, ease: "easeOut" }}
                  onClick={handleCloseCameraMarkdown}
                />
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4">
                  <motion.article
                    layoutId={
                      shouldReduceMotion ? undefined : "camera-markdown-card"
                    }
                    className="pointer-events-auto max-h-[88vh] w-full max-w-6xl overflow-hidden rounded-2xl bg-white shadow-2xl"
                    transition={{
                      layout: { duration: 0.22, ease: [0.22, 1, 0.36, 1] },
                    }}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <header className="flex items-center justify-between border-b border-zinc-200 px-5 py-4">
                      <h3 className="text-lg font-semibold text-zinc-900">
                        {cameraMarkdown.title}
                      </h3>
                      <button
                        type="button"
                        onClick={handleCloseCameraMarkdown}
                        className="rounded-md px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
                      >
                        Close
                      </button>
                    </header>

                    <div className="grid max-h-[calc(88vh-72px)] grid-cols-1 gap-0 overflow-hidden md:grid-cols-2">
                      <section className="border-b border-zinc-200 bg-zinc-950/95 p-4 md:border-b-0 md:border-r">
                        <div className="flex h-full min-h-[280px] flex-col gap-3">
                          <h4 className="text-sm font-semibold text-zinc-100">
                            Live camera to agent
                          </h4>
                          <div className="relative flex flex-1 items-center justify-center overflow-hidden rounded-xl border border-zinc-800 bg-black">
                            <video
                              ref={cameraVideoRef}
                              autoPlay
                              playsInline
                              muted
                              className="h-full max-h-[56vh] w-full object-cover"
                            />
                            {!videoStream ? (
                              <div className="absolute inset-0 flex items-center justify-center bg-black/70 p-4 text-center text-sm text-zinc-300">
                                Starting voice mode and camera. If blocked,
                                allow camera permissions.
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </section>

                      <section className="max-h-[calc(88vh-72px)] overflow-y-auto px-5 py-4">
                        <EditableMarkdownContent
                          className="markdown-content text-sm leading-6 text-zinc-800"
                          markdown={cameraMarkdown.markdown}
                          onChange={updateCameraMarkdown}
                        />
                      </section>
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
