import {
  type LiveServerContent,
  type LiveServerToolCall,
  Modality,
} from "@google/genai";
import { useEffect } from "react";
import { useLiveAPIContext } from "@/contexts/LiveAPIContext";
import { useChatStore } from "@/lib/chat/store";
import type { ParsedRenderSpec } from "@/lib/json-render/chat-renderer";
import {
  buildRenderChatUiInstruction,
  ChatSpecRenderer,
} from "@/lib/json-render/chat-runtime-renderer";
import { declaration, functionsmap } from "@/lib/toolcall/declarations";
import { AltairChart } from "./AltairChart";
import { ChatRenderErrorBoundary } from "./ChatRenderErrorBoundary";

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

const isRenderToolResult = (value: unknown): value is ParsedRenderSpec => {
  if (!isObject(value)) {
    return false;
  }

  return (
    typeof value.valid === "boolean" &&
    Array.isArray(value.issues) &&
    Array.isArray(value.warnings) &&
    isObject(value.summary)
  );
};

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

  const renderChatUiInstruction = buildRenderChatUiInstruction();

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

${renderChatUiInstruction}
`,
          },
        ],
      },
      tools: [{ functionDeclarations: declaration }],
    });
  }, [renderChatUiInstruction, setConfig, setModel]);

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
          console.info("[toolcall] received", {
            id: fc.id,
            name: fc.name,
            args: fc.args,
          });

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
            } else if (fc.name === "render_chat_ui") {
              if (!isRenderToolResult(output)) {
                console.error("[render_chat_ui] invalid-tool-output-shape", {
                  id: fc.id,
                  name: fc.name,
                  output,
                });
                addToolResult(fc.name, {
                  error: "render_chat_ui returned unexpected output shape.",
                  output,
                });
                return {
                  id: fc.id,
                  name: fc.name,
                  response: {
                    output: {
                      error:
                        "render_chat_ui failed because tool output format is invalid.",
                    },
                  },
                };
              }

              const parsed = output;
              console.info("[render_chat_ui] parsed", {
                valid: parsed.valid,
                issues: parsed.issues,
                warnings: parsed.warnings,
                summary: parsed.summary,
                markdownCards: parsed.markdownCards.length,
              });
              addJsonRenderSpec(
                parsed.spec,
                parsed.valid,
                parsed.issues,
                parsed.warnings,
              );
              if (parsed.markdownCards.length) {
                upsertMarkdownCards(parsed.markdownCards);
              }
              if (parsed.warnings.length) {
                console.warn("[render_chat_ui] warnings", {
                  id: fc.id,
                  warnings: parsed.warnings,
                });
                addSystemMessage(
                  `render_chat_ui warnings: ${parsed.warnings.join(" | ")}`,
                );
              }
              if (!parsed.valid) {
                console.error("[render_chat_ui] validation-failed", {
                  id: fc.id,
                  issues: parsed.issues,
                  summary: parsed.summary,
                });
                addSystemMessage(
                  "Received an invalid render spec. Showing fallback diagnostics.",
                );
              }
            } else {
              console.info("[toolcall] output", {
                id: fc.id,
                name: fc.name,
                output,
              });
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
            console.error("[toolcall] execution-failed", {
              id: fc.id,
              name: fc.name,
              args: fc.args,
              error,
              message,
            });
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
            return (
              <article
                key={message.id}
                className="mr-auto max-w-[95%] overflow-hidden rounded-2xl rounded-bl-sm bg-white p-4 shadow-sm"
              >
                {message.valid ? (
                  !message.spec ? (
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
                      <ChatSpecRenderer spec={message.spec} />
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
                {message.warnings.length ? (
                  <div className="mt-3 space-y-1 text-[11px] text-amber-700">
                    {message.warnings.map((warning) => (
                      <p key={`${message.id}-warning-${warning}`}>! {warning}</p>
                    ))}
                  </div>
                ) : null}
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
