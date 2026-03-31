import {
  type LiveServerContent,
  type LiveServerToolCall,
  Modality,
} from "@google/genai";
import { useEffect } from "react";
import { useLiveAPIContext } from "@/contexts/LiveAPIContext";
import { useChatStore } from "@/lib/chat/store";
import { parseRenderSpec } from "@/lib/json-render/chat-renderer";
import { declaration, functionsmap } from "@/lib/toolcall/declarations";
import { AltairChart } from "./AltairChart";
import { ChatRenderErrorBoundary } from "./ChatRenderErrorBoundary";
import { MarkdownCards } from "./MarkdownCards";
import { SafeSpecRenderer } from "./SafeSpecRenderer";

const MODEL_NAME = "models/gemini-3.1-flash-live-preview";

function extractText(content: LiveServerContent): string {
  const parts = content.modelTurn?.parts ?? [];
  return parts
    .map((part) => part.text ?? "")
    .filter(Boolean)
    .join("");
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function extractInlineMarkdownCards(
  spec: unknown,
): { title?: string; cards: Array<{ id?: string; title: string; markdown: string }> } | null {
  if (!isObject(spec) || !isObject(spec.root)) {
    return null;
  }

  const root = spec.root;
  if (root.type !== "MarkdownCards" || !isObject(root.props)) {
    return null;
  }

  const cards = Array.isArray(root.props.cards)
    ? root.props.cards
        .filter(isObject)
        .map((item) => ({
          id: typeof item.id === "string" ? item.id : undefined,
          title: typeof item.title === "string" ? item.title : "",
          markdown: typeof item.markdown === "string" ? item.markdown : "",
        }))
        .filter((item) => item.title && item.markdown)
    : [];

  if (!cards.length) {
    return null;
  }

  return {
    title: typeof root.props.title === "string" ? root.props.title : undefined,
    cards,
  };
}

export function ChatScreen() {
  const { client, setConfig, setModel } = useLiveAPIContext();
  const {
    messages,
    addAssistantTextChunk,
    finalizeAssistantText,
    addToolResult,
    addAltairSpec,
    addJsonRenderSpec,
    addSystemMessage,
    upsertMarkdownCards,
  } = useChatStore();

  useEffect(() => {
    setModel(MODEL_NAME);
    setConfig({
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } },
      },
      systemInstruction: {
        parts: [
          {
            text: `
You are a voice-first document and financial assistant.

- If screen sharing is unavailable, say: "Please turn on the screen."
- Keep answers concise and accurate.
- Do not hallucinate. Ask follow-up questions when needed.
- Use function tools for data retrieval and actions.
- Use render_altair for Vega/Altair chart payloads only.

render_chat_ui contract (strict):
1) Always pass a JSON string in spec_json.
2) Allowed component types only: Card, Stack, Heading, Text, Badge, Separator, Table, Alert, MarkdownCards.
3) Do not include on/watch/actions/state mutations in specs.
4) Keep specs compact: max ~20 elements and concise text.
5) For markdown knowledge cards, use MarkdownCards with cards:[{id?,title,markdown}].

Good render_chat_ui example (summary card):
{"root":{"type":"Card","props":{"title":"Budget Summary"},"children":[{"type":"Stack","props":{"direction":"vertical","gap":2},"children":[{"type":"Text","props":{"text":"Spending is 12% lower than last month."}},{"type":"Badge","props":{"text":"Stable","variant":"secondary"}}]}]}}

Good render_chat_ui example (markdown cards):
{"root":{"type":"MarkdownCards","props":{"title":"Investment Notes","cards":[{"id":"sip-basics","title":"SIP Basics","markdown":"## SIP\nA SIP invests a fixed amount every month..."},{"title":"Risk Ladder","markdown":"### Conservative\n- Debt funds\n### Moderate\n- Hybrid funds"}]}}}

Bad example (do not do):
{"root":{"type":"Button","on":{"press":{"action":"setState"}}}}
`,
          },
        ],
      },
      tools: [{ functionDeclarations: declaration }],
    });
  }, [setConfig, setModel]);

  useEffect(() => {
    const onContent = (content: LiveServerContent) => {
      const text = extractText(content);
      if (text.trim()) {
        addAssistantTextChunk(text);
      }
    };

    const onTurnComplete = () => {
      finalizeAssistantText();
    };

    const onToolCall = async (toolCall: LiveServerToolCall) => {
      const calls = toolCall.functionCalls ?? [];
      if (!calls.length) {
        return;
      }

      const functionResponses = await Promise.all(
        calls.map(async (fc) => {
          const fn = fc.name ? functionsmap[fc.name] : undefined;

          if (!fc.name || typeof fn !== "function") {
            return {
              id: fc.id,
              name: fc.name,
              response: { output: { error: `Unknown tool: ${fc.name}` } },
            };
          }

          try {
            const output = await fn(fc.args);

            if (fc.name === "render_altair" && typeof output === "string") {
              addAltairSpec(output);
            } else if (
              fc.name === "render_chat_ui" &&
              typeof output === "string"
            ) {
              console.info("[render_chat_ui] raw-output", {
                chars: output.length,
                preview: output.slice(0, 220),
              });
              const parsed = parseRenderSpec(output);
              console.info("[render_chat_ui] parsed", {
                valid: parsed.valid,
                issues: parsed.issues,
                summary: parsed.summary,
                markdownCards: parsed.markdownCards.length,
              });
              addJsonRenderSpec(parsed.spec as never, parsed.valid, parsed.issues);
              if (parsed.markdownCards.length) {
                upsertMarkdownCards(parsed.markdownCards);
              }
              if (!parsed.valid) {
                addSystemMessage(
                  "Received an invalid render spec. Showing fallback diagnostics.",
                );
              }
            } else {
              addToolResult(fc.name, output);
            }

            return {
              id: fc.id,
              name: fc.name,
              response: { output },
            };
          } catch (error) {
            const message =
              error instanceof Error ? error.message : "Tool call failed.";
            addToolResult(fc.name, { error: message });
            return {
              id: fc.id,
              name: fc.name,
              response: { output: { error: message } },
            };
          }
        }),
      );

      client.sendToolResponse({ functionResponses });
    };

    client.on("content", onContent);
    client.on("turncomplete", onTurnComplete);
    client.on("toolcall", onToolCall);

    return () => {
      client.off("content", onContent);
      client.off("turncomplete", onTurnComplete);
      client.off("toolcall", onToolCall);
    };
  }, [
    addAltairSpec,
    addAssistantTextChunk,
    addJsonRenderSpec,
    addSystemMessage,
    upsertMarkdownCards,
    addToolResult,
    client,
    finalizeAssistantText,
  ]);

  return (
    <section className="w-full max-w-5xl px-4 pb-44 pt-6 md:px-8">
      <div className="space-y-3">
        {messages.map((message) => {
          const isUser = message.role === "user";
          const bubbleClass = isUser
            ? "ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-zinc-900 px-4 py-3 text-sm text-white"
            : "mr-auto max-w-[92%] rounded-2xl rounded-bl-sm bg-white/85 px-4 py-3 text-sm text-zinc-900 shadow-sm";

          if (message.kind === "text") {
            return (
              <article key={message.id} className={bubbleClass}>
                <p className="whitespace-pre-wrap">{message.text}</p>
              </article>
            );
          }

          if (message.kind === "altair") {
            return (
              <article
                key={message.id}
                className="mr-auto max-w-[95%] overflow-hidden rounded-2xl rounded-bl-sm bg-white p-2 shadow-sm"
              >
                <AltairChart specJson={message.specJson} />
              </article>
            );
          }

          if (message.kind === "json-render") {
            const inlineMarkdown = extractInlineMarkdownCards(message.spec);
            return (
              <article
                key={message.id}
                className="mr-auto max-w-[95%] overflow-hidden rounded-2xl rounded-bl-sm bg-white p-4 shadow-sm"
              >
                {message.valid ? (
                  inlineMarkdown ? (
                    <MarkdownCards
                      title={inlineMarkdown.title}
                      cards={inlineMarkdown.cards}
                    />
                  ) : !message.spec ? (
                    <div className="space-y-2 text-xs text-amber-700">
                      <p>Spec marked valid but payload is empty.</p>
                    </div>
                  ) : (
                    <ChatRenderErrorBoundary
                      debugLabel={`json-render:${message.id}`}
                      fallback={
                        <div className="space-y-2 text-xs text-amber-700">
                          <p>Renderer crashed for this spec. Fallback shown.</p>
                          <p>
                            The markdown board still receives extracted cards when
                            available.
                          </p>
                        </div>
                      }
                    >
                      <SafeSpecRenderer spec={message.spec} />
                    </ChatRenderErrorBoundary>
                  )
                ) : (
                  <div className="space-y-2 text-xs text-red-600">
                    <p>Could not render the spec from the model output.</p>
                    {message.issues.map((issue) => (
                      <p key={`${message.id}-${issue}`}>- {issue}</p>
                    ))}
                  </div>
                )}
              </article>
            );
          }

          return (
            <article
              key={message.id}
              className="mr-auto max-w-[92%] rounded-2xl rounded-bl-sm border border-zinc-200 bg-white/90 px-4 py-3 text-xs text-zinc-700 shadow-sm"
            >
              <p className="mb-1 font-semibold">Tool: {message.name}</p>
              <pre className="overflow-x-auto whitespace-pre-wrap break-words">
                {JSON.stringify(message.output, null, 2)}
              </pre>
            </article>
          );
        })}
      </div>
    </section>
  );
}
