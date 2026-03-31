import { Fragment } from "react";
import { MarkdownCards } from "./MarkdownCards";
import type { TreeNode, TreeSpec } from "@/lib/json-render/chat-renderer";

const asText = (value: unknown) =>
  typeof value === "string" || typeof value === "number"
    ? String(value)
    : undefined;

const asList = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

function renderNode(node: TreeNode, key: string): JSX.Element | null {
  const props = node.props ?? {};
  const children = node.children ?? [];

  if (node.type === "Card") {
    const title = asText(props.title);
    const description = asText(props.description);

    return (
      <article key={key} className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        {title ? <h3 className="text-lg font-semibold text-zinc-900">{title}</h3> : null}
        {description ? (
          <p className="mt-1 text-sm text-zinc-600">{description}</p>
        ) : null}
        {children.length ? <div className="mt-3 space-y-2">{children.map((child, index) => renderNode(child, `${key}-c-${index}`))}</div> : null}
      </article>
    );
  }

  if (node.type === "Stack") {
    const direction = asText(props.direction) === "horizontal" ? "flex-row" : "flex-col";
    return (
      <div key={key} className={`flex ${direction} gap-2`}>
        {children.map((child, index) => renderNode(child, `${key}-s-${index}`))}
      </div>
    );
  }

  if (node.type === "Heading") {
    const level = Number(props.level ?? 2);
    const text = asText(props.text ?? props.title);
    const className =
      level <= 1
        ? "text-2xl font-bold"
        : level === 2
          ? "text-xl font-semibold"
          : "text-lg font-semibold";
    return text ? (
      <h3 key={key} className={`${className} text-zinc-900`}>
        {text}
      </h3>
    ) : null;
  }

  if (node.type === "Text") {
    const text = asText(props.text ?? props.value ?? props.label);
    return text ? (
      <p key={key} className="whitespace-pre-wrap text-sm text-zinc-700">
        {text}
      </p>
    ) : null;
  }

  if (node.type === "Badge") {
    const text = asText(props.text ?? props.label);
    return text ? (
      <span
        key={key}
        className="inline-flex items-center rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-700"
      >
        {text}
      </span>
    ) : null;
  }

  if (node.type === "Separator") {
    return <hr key={key} className="my-2 border-zinc-200" />;
  }

  if (node.type === "Alert") {
    const title = asText(props.title) ?? "Notice";
    const message = asText(props.message ?? props.text) ?? "";
    return (
      <div key={key} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
        <p className="text-sm font-semibold text-amber-900">{title}</p>
        {message ? <p className="mt-1 text-sm text-amber-800">{message}</p> : null}
      </div>
    );
  }

  if (node.type === "Table") {
    const columns = asList(props.columns).map((col) => asText(col) ?? "");
    const rows = asList(props.rows).map((row) =>
      asList(row).map((cell) => asText(cell) ?? ""),
    );
    return (
      <div key={key} className="overflow-x-auto rounded-lg border border-zinc-200">
        <table className="min-w-full text-sm">
          {columns.length ? (
            <thead className="bg-zinc-100">
              <tr>
                {columns.map((column, index) => (
                  <th key={`${key}-h-${index}`} className="px-3 py-2 text-left font-medium text-zinc-700">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
          ) : null}
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={`${key}-r-${rowIndex}`} className="border-t border-zinc-200">
                {row.map((cell, cellIndex) => (
                  <td key={`${key}-r-${rowIndex}-c-${cellIndex}`} className="px-3 py-2 text-zinc-700">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (node.type === "MarkdownCards") {
    const cards = asList(props.cards)
      .filter((item): item is Record<string, unknown> =>
        typeof item === "object" && item !== null,
      )
      .map((item) => ({
        id: asText(item.id),
        title: asText(item.title) ?? "",
        markdown: asText(item.markdown) ?? "",
      }))
      .filter((item) => item.title && item.markdown);

    if (!cards.length) {
      return null;
    }

    return (
      <MarkdownCards
        key={key}
        title={asText(props.title)}
        cards={cards}
      />
    );
  }

  return (
    <Fragment key={key}>
      {children.map((child, index) => renderNode(child, `${key}-u-${index}`))}
    </Fragment>
  );
}

type SafeSpecRendererProps = {
  spec: TreeSpec;
};

export function SafeSpecRenderer({ spec }: SafeSpecRendererProps) {
  return <>{renderNode(spec.root, "root")}</>;
}
