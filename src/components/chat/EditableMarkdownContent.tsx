import type {
  ComponentPropsWithoutRef,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent,
  MutableRefObject,
} from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

type LineRange = {
  start: number;
  end: number;
};

type PositionLike = {
  start?: { line?: number };
  end?: { line?: number };
};

type EditableMarkdownContentProps = {
  markdown: string;
  className?: string;
  onChange: (nextMarkdown: string) => void;
};

const getPositionRange = (node: unknown): LineRange | null => {
  const position = (node as { position?: PositionLike } | undefined)?.position;
  const start = position?.start?.line;
  const end = position?.end?.line;

  if (!Number.isInteger(start) || !Number.isInteger(end)) {
    return null;
  }

  if (!start || !end || start <= 0 || end < start) {
    return null;
  }

  return { start, end };
};

const rangesMatch = (left: LineRange | null, right: LineRange | null) =>
  !!left && !!right && left.start === right.start && left.end === right.end;

const getSliceByRange = (source: string, range: LineRange) => {
  const lines = source.split("\n");
  return lines.slice(range.start - 1, range.end).join("\n");
};

const replaceSliceByRange = (
  source: string,
  range: LineRange,
  nextSlice: string,
) => {
  const lines = source.split("\n");
  const replacementLines = nextSlice.split("\n");
  const nextLines = [
    ...lines.slice(0, range.start - 1),
    ...replacementLines,
    ...lines.slice(range.end),
  ];
  return nextLines.join("\n");
};

const mergeClassName = (...parts: Array<string | undefined>) =>
  parts.filter(Boolean).join(" ").trim();

type EditableBlockProps = {
  range: LineRange | null;
  activeRange: LineRange | null;
  draftRef: MutableRefObject<string>;
  onStartEditing: (range: LineRange) => void;
  onSave: () => void;
  onCancel: () => void;
};

type EditableTag =
  | "p"
  | "li"
  | "pre"
  | "h1"
  | "h2"
  | "h3"
  | "blockquote"
  | "table";

const parseRangeFromAttribute = (value: string | null): LineRange | null => {
  if (!value) {
    return null;
  }
  const [startText, endText] = value.split("-");
  const start = Number(startText);
  const end = Number(endText);
  if (!Number.isInteger(start) || !Number.isInteger(end) || start <= 0 || end < start) {
    return null;
  }
  return { start, end };
};

const getAdjacentRange = (
  currentBlock: HTMLElement,
  direction: "next" | "prev",
): LineRange | null => {
  const root = currentBlock.closest("article");
  if (!root) {
    return null;
  }

  const blocks = Array.from(root.querySelectorAll<HTMLElement>("[data-line-range]"));
  const currentIndex = blocks.indexOf(currentBlock);
  if (currentIndex < 0) {
    return null;
  }

  const targetIndex = direction === "next" ? currentIndex + 1 : currentIndex - 1;
  const target = blocks[targetIndex];
  if (!target) {
    return null;
  }

  return parseRangeFromAttribute(target.getAttribute("data-line-range"));
};

const focusAdjacentEditableBlock = (
  current: HTMLElement,
  direction: "next" | "prev",
) => {
  const root = current.closest("article");
  if (!root) {
    return;
  }

  const blocks = Array.from(
    root.querySelectorAll<HTMLElement>("[data-line-range][tabindex='0']"),
  );
  const currentIndex = blocks.indexOf(current);
  if (currentIndex < 0) {
    return;
  }

  const targetIndex =
    direction === "next" ? currentIndex + 1 : currentIndex - 1;
  blocks[targetIndex]?.focus();
};

function EditableBlock<Tag extends EditableTag>({
  tag,
  props,
  children,
  range,
  activeRange,
  draftRef,
  onStartEditing,
  onSave,
}: EditableBlockProps & {
  tag: Tag;
  props: ComponentPropsWithoutRef<Tag>;
  children: ComponentPropsWithoutRef<Tag>["children"];
}) {
  const TagName = tag;
  const isActive = rangesMatch(range, activeRange);
  const syncTextareaHeight = (node: HTMLTextAreaElement | null) => {
    if (!node) {
      return;
    }
    node.style.height = "0px";
    node.style.height = `${node.scrollHeight}px`;
  };

  if (isActive && range) {
    const activeDataProps = {
      "data-line-range": `${range.start}-${range.end}`,
    };

    const textarea = (
      <textarea
        defaultValue={draftRef.current}
        autoFocus
        rows={1}
        ref={syncTextareaHeight}
        onChange={(event) => {
          draftRef.current = event.target.value;
          syncTextareaHeight(event.currentTarget);
        }}
        onBlur={onSave}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onSave();
          }

          if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            const textarea = event.currentTarget;
            const selectionStart = textarea.selectionStart ?? 0;
            const selectionEnd = textarea.selectionEnd ?? selectionStart;
            const hasSelection = selectionStart !== selectionEnd;
            if (!hasSelection) {
              const before = textarea.value.slice(0, selectionStart);
              const after = textarea.value.slice(selectionEnd);
              const atFirstLine = !before.includes("\n");
              const atLastLine = !after.includes("\n");
              const direction = event.key === "ArrowUp" ? "prev" : "next";
              const shouldMove =
                (event.key === "ArrowUp" && atFirstLine) ||
                (event.key === "ArrowDown" && atLastLine);

              if (shouldMove) {
                const currentBlock = textarea.closest<HTMLElement>("[data-line-range]");
                const adjacentRange = currentBlock
                  ? getAdjacentRange(currentBlock, direction)
                  : null;

                if (adjacentRange) {
                  const root = textarea.closest("article");
                  const targetSelector = `[data-line-range="${adjacentRange.start}-${adjacentRange.end}"] .md-editable-textarea`;
                  event.preventDefault();
                  draftRef.current = textarea.value;
                  onSave();

                  window.setTimeout(() => {
                    onStartEditing(adjacentRange);
                    window.setTimeout(() => {
                      if (!root) {
                        return;
                      }
                      const target = root.querySelector<HTMLTextAreaElement>(targetSelector);
                      if (!target) {
                        return;
                      }
                      const cursorIndex =
                        direction === "prev" ? target.value.length : 0;
                      target.focus();
                      target.setSelectionRange(cursorIndex, cursorIndex);
                    }, 0);
                  }, 0);
                  return;
                }
              }
            }
          }

          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault();
            onSave();
          }
        }}
        className="md-editable-textarea m-0 block w-full resize-none overflow-hidden border-0 bg-transparent p-0 text-inherit focus:outline-none"
        style={{
          fontFamily: "inherit",
          fontSize: "inherit",
          lineHeight: "inherit",
        }}
      />
    );

    const activeClassName = mergeClassName(
      (props as { className?: string }).className,
      "md-editable-line md-editable-line--active",
    );
    if (TagName === "p") {
      const pProps = props as ComponentPropsWithoutRef<"p">;
      return (
        <p {...pProps} {...activeDataProps} className={activeClassName}>
          {textarea}
        </p>
      );
    }
    if (TagName === "li") {
      const liProps = props as ComponentPropsWithoutRef<"li">;
      return (
        <li {...liProps} {...activeDataProps} className={activeClassName}>
          {textarea}
        </li>
      );
    }
    if (TagName === "h1") {
      const h1Props = props as ComponentPropsWithoutRef<"h1">;
      return (
        <h1 {...h1Props} {...activeDataProps} className={activeClassName}>
          {textarea}
        </h1>
      );
    }
    if (TagName === "h2") {
      const h2Props = props as ComponentPropsWithoutRef<"h2">;
      return (
        <h2 {...h2Props} {...activeDataProps} className={activeClassName}>
          {textarea}
        </h2>
      );
    }
    if (TagName === "h3") {
      const h3Props = props as ComponentPropsWithoutRef<"h3">;
      return (
        <h3 {...h3Props} {...activeDataProps} className={activeClassName}>
          {textarea}
        </h3>
      );
    }
    if (TagName === "blockquote") {
      const blockquoteProps = props as ComponentPropsWithoutRef<"blockquote">;
      return (
        <blockquote
          {...blockquoteProps}
          {...activeDataProps}
          className={activeClassName}
        >
          {textarea}
        </blockquote>
      );
    }
    if (TagName === "pre") {
      const preProps = props as ComponentPropsWithoutRef<"pre">;
      return (
        <pre {...preProps} {...activeDataProps} className={activeClassName}>
          {textarea}
        </pre>
      );
    }
    return (
      <div {...activeDataProps} className={activeClassName}>
        {textarea}
      </div>
    );
  }

  const handleClick = (event: MouseEvent<HTMLElement>) => {
    const inputProps = props as {
      onClick?: (evt: MouseEvent<HTMLElement>) => void;
    };
    inputProps.onClick?.(event);
    if (!range || activeRange) {
      return;
    }
    event.stopPropagation();
    onStartEditing(range);
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (!range || activeRange) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusAdjacentEditableBlock(event.currentTarget, "next");
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      focusAdjacentEditableBlock(event.currentTarget, "prev");
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      onStartEditing(range);
    }
  };

  const sharedProps = {
    ...(props as object),
    onClick: handleClick,
    onKeyDown: handleKeyDown,
    tabIndex: range && !activeRange ? 0 : undefined,
    className:
      range && !activeRange
        ? mergeClassName(
            (props as { className?: string }).className,
            "md-editable-line cursor-text focus:outline-none",
          )
        : (props as { className?: string }).className,
    "data-line-range": range ? `${range.start}-${range.end}` : undefined,
  };

  if (TagName === "p") {
    return (
      <p {...(sharedProps as ComponentPropsWithoutRef<"p">)}>{children}</p>
    );
  }
  if (TagName === "li") {
    return (
      <li {...(sharedProps as ComponentPropsWithoutRef<"li">)}>{children}</li>
    );
  }
  if (TagName === "pre") {
    return (
      <pre {...(sharedProps as ComponentPropsWithoutRef<"pre">)}>
        {children}
      </pre>
    );
  }
  if (TagName === "h1") {
    return (
      <h1 {...(sharedProps as ComponentPropsWithoutRef<"h1">)}>{children}</h1>
    );
  }
  if (TagName === "h2") {
    return (
      <h2 {...(sharedProps as ComponentPropsWithoutRef<"h2">)}>{children}</h2>
    );
  }
  if (TagName === "h3") {
    return (
      <h3 {...(sharedProps as ComponentPropsWithoutRef<"h3">)}>{children}</h3>
    );
  }
  if (TagName === "blockquote") {
    return (
      <blockquote {...(sharedProps as ComponentPropsWithoutRef<"blockquote">)}>
        {children}
      </blockquote>
    );
  }
  return (
    <table {...(sharedProps as ComponentPropsWithoutRef<"table">)}>
      {children}
    </table>
  );
}

export function EditableMarkdownContent({
  markdown,
  className,
  onChange,
}: EditableMarkdownContentProps) {
  const [activeRange, setActiveRange] = useState<LineRange | null>(null);
  const draftRef = useRef("");
  const containerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!activeRange) {
      containerRef.current?.focus();
    }
  }, [activeRange]);

  const focusFromContainer = (direction: "next" | "prev") => {
    const root = containerRef.current;
    if (!root) {
      return;
    }
    const blocks = Array.from(
      root.querySelectorAll<HTMLElement>("[data-line-range][tabindex='0']"),
    );
    if (!blocks.length) {
      return;
    }

    const current = document.activeElement as HTMLElement | null;
    const currentIndex = current ? blocks.indexOf(current) : -1;
    if (currentIndex < 0) {
      const fallback =
        direction === "next" ? blocks[0] : blocks[blocks.length - 1];
      fallback.focus();
      return;
    }

    const targetIndex =
      direction === "next" ? currentIndex + 1 : currentIndex - 1;
    blocks[targetIndex]?.focus();
  };

  const handleContainerKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (activeRange) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusFromContainer("next");
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      focusFromContainer("prev");
    }
  };

  const markdownComponents = useMemo(
    () => ({
      p: ({
        node,
        ...props
      }: ComponentPropsWithoutRef<"p"> & { node?: unknown }) => (
        <EditableBlock
          tag="p"
          props={props}
          children={props.children}
          range={getPositionRange(node)}
          activeRange={activeRange}
          draftRef={draftRef}
          onStartEditing={(range) => {
            setActiveRange(range);
            draftRef.current = getSliceByRange(markdown, range);
          }}
          onSave={() => {
            if (!activeRange) {
              return;
            }
            const nextMarkdown = replaceSliceByRange(
              markdown,
              activeRange,
              draftRef.current,
            );
            setActiveRange(null);
            if (nextMarkdown !== markdown) {
              onChange(nextMarkdown);
            }
          }}
          onCancel={() => {
            setActiveRange(null);
            draftRef.current = "";
          }}
        />
      ),
      li: ({
        node,
        ...props
      }: ComponentPropsWithoutRef<"li"> & { node?: unknown }) => (
        <EditableBlock
          tag="li"
          props={props}
          children={props.children}
          range={getPositionRange(node)}
          activeRange={activeRange}
          draftRef={draftRef}
          onStartEditing={(range) => {
            setActiveRange(range);
            draftRef.current = getSliceByRange(markdown, range);
          }}
          onSave={() => {
            if (!activeRange) {
              return;
            }
            const nextMarkdown = replaceSliceByRange(
              markdown,
              activeRange,
              draftRef.current,
            );
            setActiveRange(null);
            if (nextMarkdown !== markdown) {
              onChange(nextMarkdown);
            }
          }}
          onCancel={() => {
            setActiveRange(null);
            draftRef.current = "";
          }}
        />
      ),
      pre: ({
        node,
        ...props
      }: ComponentPropsWithoutRef<"pre"> & { node?: unknown }) => (
        <EditableBlock
          tag="pre"
          props={props}
          children={props.children}
          range={getPositionRange(node)}
          activeRange={activeRange}
          draftRef={draftRef}
          onStartEditing={(range) => {
            setActiveRange(range);
            draftRef.current = getSliceByRange(markdown, range);
          }}
          onSave={() => {
            if (!activeRange) {
              return;
            }
            const nextMarkdown = replaceSliceByRange(
              markdown,
              activeRange,
              draftRef.current,
            );
            setActiveRange(null);
            if (nextMarkdown !== markdown) {
              onChange(nextMarkdown);
            }
          }}
          onCancel={() => {
            setActiveRange(null);
            draftRef.current = "";
          }}
        />
      ),
      h1: ({
        node,
        ...props
      }: ComponentPropsWithoutRef<"h1"> & { node?: unknown }) => (
        <EditableBlock
          tag="h1"
          props={props}
          children={props.children}
          range={getPositionRange(node)}
          activeRange={activeRange}
          draftRef={draftRef}
          onStartEditing={(range) => {
            setActiveRange(range);
            draftRef.current = getSliceByRange(markdown, range);
          }}
          onSave={() => {
            if (!activeRange) {
              return;
            }
            const nextMarkdown = replaceSliceByRange(
              markdown,
              activeRange,
              draftRef.current,
            );
            setActiveRange(null);
            if (nextMarkdown !== markdown) {
              onChange(nextMarkdown);
            }
          }}
          onCancel={() => {
            setActiveRange(null);
            draftRef.current = "";
          }}
        />
      ),
      h2: ({
        node,
        ...props
      }: ComponentPropsWithoutRef<"h2"> & { node?: unknown }) => (
        <EditableBlock
          tag="h2"
          props={props}
          children={props.children}
          range={getPositionRange(node)}
          activeRange={activeRange}
          draftRef={draftRef}
          onStartEditing={(range) => {
            setActiveRange(range);
            draftRef.current = getSliceByRange(markdown, range);
          }}
          onSave={() => {
            if (!activeRange) {
              return;
            }
            const nextMarkdown = replaceSliceByRange(
              markdown,
              activeRange,
              draftRef.current,
            );
            setActiveRange(null);
            if (nextMarkdown !== markdown) {
              onChange(nextMarkdown);
            }
          }}
          onCancel={() => {
            setActiveRange(null);
            draftRef.current = "";
          }}
        />
      ),
      h3: ({
        node,
        ...props
      }: ComponentPropsWithoutRef<"h3"> & { node?: unknown }) => (
        <EditableBlock
          tag="h3"
          props={props}
          children={props.children}
          range={getPositionRange(node)}
          activeRange={activeRange}
          draftRef={draftRef}
          onStartEditing={(range) => {
            setActiveRange(range);
            draftRef.current = getSliceByRange(markdown, range);
          }}
          onSave={() => {
            if (!activeRange) {
              return;
            }
            const nextMarkdown = replaceSliceByRange(
              markdown,
              activeRange,
              draftRef.current,
            );
            setActiveRange(null);
            if (nextMarkdown !== markdown) {
              onChange(nextMarkdown);
            }
          }}
          onCancel={() => {
            setActiveRange(null);
            draftRef.current = "";
          }}
        />
      ),
      blockquote: ({
        node,
        ...props
      }: ComponentPropsWithoutRef<"blockquote"> & { node?: unknown }) => (
        <EditableBlock
          tag="blockquote"
          props={props}
          children={props.children}
          range={getPositionRange(node)}
          activeRange={activeRange}
          draftRef={draftRef}
          onStartEditing={(range) => {
            setActiveRange(range);
            draftRef.current = getSliceByRange(markdown, range);
          }}
          onSave={() => {
            if (!activeRange) {
              return;
            }
            const nextMarkdown = replaceSliceByRange(
              markdown,
              activeRange,
              draftRef.current,
            );
            setActiveRange(null);
            if (nextMarkdown !== markdown) {
              onChange(nextMarkdown);
            }
          }}
          onCancel={() => {
            setActiveRange(null);
            draftRef.current = "";
          }}
        />
      ),
      table: ({
        node,
        ...props
      }: ComponentPropsWithoutRef<"table"> & { node?: unknown }) => (
        <EditableBlock
          tag="table"
          props={props}
          children={props.children}
          range={getPositionRange(node)}
          activeRange={activeRange}
          draftRef={draftRef}
          onStartEditing={(range) => {
            setActiveRange(range);
            draftRef.current = getSliceByRange(markdown, range);
          }}
          onSave={() => {
            if (!activeRange) {
              return;
            }
            const nextMarkdown = replaceSliceByRange(
              markdown,
              activeRange,
              draftRef.current,
            );
            setActiveRange(null);
            if (nextMarkdown !== markdown) {
              onChange(nextMarkdown);
            }
          }}
          onCancel={() => {
            setActiveRange(null);
            draftRef.current = "";
          }}
        />
      ),
    }),
    [activeRange, markdown, onChange],
  );

  return (
    <article
      ref={containerRef}
      tabIndex={0}
      onKeyDown={handleContainerKeyDown}
      className={`${className ?? ""} md-editable-root relative focus:outline-none`.trim()}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath, remarkBreaks]}
        rehypePlugins={[rehypeKatex, rehypeHighlight]}
        components={markdownComponents}
      >
        {markdown}
      </ReactMarkdown>
      {activeRange ? (
        <div className="pointer-events-none fixed bottom-3 right-4 z-50 rounded bg-white/85 px-2 py-1 text-[11px] text-zinc-500 shadow-sm">
          Esc or Ctrl/Cmd+Enter to save
        </div>
      ) : null}
    </article>
  );
}
