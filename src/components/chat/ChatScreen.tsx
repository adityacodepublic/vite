import {
  type LiveServerContent,
  type LiveServerToolCall,
  Modality,
} from "@google/genai";
import { useEffect } from "react";
import { useLiveAPIContext } from "@/contexts/LiveAPIContext";
import { useChatStore } from "@/lib/chat/store";
import type { ParsedRenderSpec } from "@/lib/json-render/chat-renderer";
import { ChatSpecRenderer } from "@/lib/json-render/chat-runtime-renderer";
import { declaration, functionsmap } from "@/lib/toolcall/declarations";
import { AltairChart } from "./AltairChart";
import { ChatRenderErrorBoundary } from "./ChatRenderErrorBoundary";
import { AttachmentProgressCircle } from "./AttachmentProgressCircle";

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

const MAX_LOG_PREVIEW_CHARS = 1600;

const toLogPreview = (value: unknown): string => {
  try {
    const serialized = JSON.stringify(value);
    if (!serialized) {
      return "";
    }
    if (serialized.length <= MAX_LOG_PREVIEW_CHARS) {
      return serialized;
    }
    return `${serialized.slice(0, MAX_LOG_PREVIEW_CHARS)}...`;
  } catch {
    return "[unserializable]";
  }
};

const toolLog = (
  level: "info" | "warn" | "error",
  stage: string,
  details: Record<string, unknown>,
) => {
  const prefix = `[ToolCall][${stage}]`;
  if (level === "error") {
    console.error(prefix, details);
    return;
  }
  if (level === "warn") {
    console.warn(prefix, details);
    return;
  }
  console.log(prefix, details);
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

  useEffect(() => {
    console.log("[ToolConfig][render_ui.declaration]", {
      declaration: declaration.find((item) => item.name === "render_ui"),
    });

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
- Use render_altair for Vega/Altair chart payloads only.
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
        toolLog("warn", "received.empty", { toolCall });
        return;
      }

      const functionResponses = await Promise.all(
        calls.map(async (fc) => {
          const callId = fc.id ?? "unknown-call-id";
          const toolName = fc.name ?? "unknown-tool";
          const startedAt = performance.now();

          const fn = fc.name ? functionsmap[fc.name] : undefined;

          if (!fc.name || typeof fn !== "function") {
            toolLog("error", "execute.unknown-tool", {
              callId,
              toolName,
              argsPreview: toLogPreview(fc.args),
              location: "ChatScreen.tsx:onToolCall:function-lookup",
            });
            return {
              id: fc.id,
              name: fc.name,
              response: { output: { error: `Unknown tool: ${fc.name}` } },
            };
          }

          try {
            toolLog("info", "execute.start", {
              callId,
              toolName,
              argsPreview: toLogPreview(fc.args),
              location: "ChatScreen.tsx:onToolCall:fn(fc.args)",
            });
            const output = await fn(fc.args);
            const durationMs =
              Math.round((performance.now() - startedAt) * 100) / 100;

            toolLog("info", "execute.success", {
              callId,
              toolName,
              durationMs,
              outputPreview: toLogPreview(output),
            });

            if (fc.name === "render_altair" && typeof output === "string") {
              addAltairSpec(output);
            } else if (fc.name === "render_ui") {
              if (!isRenderToolResult(output)) {
                toolLog("error", "render_ui.invalid-output-shape", {
                  callId,
                  toolName,
                  outputPreview: toLogPreview(output),
                  location: "ChatScreen.tsx:onToolCall:isRenderToolResult",
                });
                addToolResult(fc.name, {
                  error: "render_ui returned unexpected output shape.",
                  output,
                });
                return {
                  id: fc.id,
                  name: fc.name,
                  response: {
                    output: {
                      error:
                        "render_ui failed because tool output format is invalid.",
                    },
                  },
                };
              }

              const parsed = output;
              if (parsed.valid) {
                toolLog("info", "render_ui.validation.ok", {
                  callId,
                  toolName,
                  summary: parsed.summary,
                  markdownCards: parsed.markdownCards.length,
                  warnings: parsed.warnings,
                });
              } else {
                const firstIssue =
                  parsed.issues[0] ?? "unknown validation issue";
                toolLog("error", "render_ui.validation.failed", {
                  callId,
                  toolName,
                  firstIssue,
                  issues: parsed.issues,
                  summary: parsed.summary,
                  argsPreview: toLogPreview(fc.args),
                  location: "chat-renderer.ts:treeSpecSchema.safeParse",
                });
              }

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
                toolLog("warn", "render_ui.warnings", {
                  callId,
                  toolName,
                  warnings: parsed.warnings,
                });
                addSystemMessage(
                  `render_ui warnings: ${parsed.warnings.join(" | ")}`,
                );
              }
              if (!parsed.valid) {
                addSystemMessage(
                  "Received an invalid render spec. Showing fallback diagnostics.",
                );
              }
            } else {
              toolLog("info", "execute.output", {
                callId,
                toolName,
                outputPreview: toLogPreview(output),
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
            const durationMs =
              Math.round((performance.now() - startedAt) * 100) / 100;
            toolLog("error", "execute.error", {
              callId,
              toolName,
              durationMs,
              argsPreview: toLogPreview(fc.args),
              error,
              message,
              location: "ChatScreen.tsx:onToolCall:try/catch",
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

      try {
        client.sendToolResponse({ functionResponses });
        functionResponses.forEach((response) => {
          toolLog("info", "response.sent", {
            callId: response.id ?? "unknown-call-id",
            toolName: response.name ?? "unknown-tool",
            payloadPreview: toLogPreview(response.response),
          });
        });
      } catch (error) {
        toolLog("error", "response.send-failed", {
          payloadPreview: toLogPreview({ functionResponses }),
          error,
          location: "ChatScreen.tsx:onToolCall:client.sendToolResponse",
        });
      }
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
            ? "ml-auto w-fit max-w-[72%] rounded-2xl rounded-br-sm bg-zinc-900 px-4 py-3 text-sm text-white"
            : "mr-auto w-fit max-w-[76%] rounded-2xl rounded-bl-sm bg-white/85 px-4 py-3 text-sm text-zinc-900 shadow-sm";

          if (message.kind === "text") {
            return (
              <article key={message.id} className={bubbleClass}>
                <p className="whitespace-pre-wrap break-words">
                  {message.text}
                </p>
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
                            The markdown board still receives extracted cards
                            when available.
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
                      <p key={`${message.id}-warning-${warning}`}>
                        ! {warning}
                      </p>
                    ))}
                  </div>
                ) : null}
              </article>
            );
          }

          if (message.kind === "attachment") {
            return (
              <article
                key={message.id}
                className="ml-auto w-fit max-w-[70vw] overflow-hidden rounded-2xl rounded-br-sm bg-zinc-900/90 p-2 text-white shadow-sm"
              >
                <div className="relative overflow-hidden rounded-xl bg-black/30">
                  {message.mediaType === "image" ? (
                    <img
                      src={message.previewUrl}
                      alt={message.name}
                      className="block max-h-72 max-w-[70vw] object-contain"
                    />
                  ) : null}
                  {message.mediaType === "video" ? (
                    <video
                      src={message.previewUrl}
                      controls
                      playsInline
                      className="block max-h-72 max-w-[70vw]"
                    />
                  ) : null}
                  {message.mediaType === "audio" ? (
                    <div className="flex min-h-24 items-center justify-center p-4">
                      <audio
                        src={message.previewUrl}
                        controls
                        className="w-[22rem] max-w-[62vw]"
                      />
                    </div>
                  ) : null}
                  {message.status === "streaming" ? (
                    <AttachmentProgressCircle progress={message.progress} />
                  ) : null}
                </div>
                <div className="mt-2 flex items-center justify-between text-[11px] text-zinc-200">
                  <span className="truncate">{message.name}</span>
                  <span>
                    {message.status === "failed"
                      ? "failed"
                      : message.status === "done"
                        ? "sent"
                        : "sending"}
                  </span>
                </div>
                {message.error ? (
                  <p className="mt-1 text-[11px] text-red-300">
                    {message.error}
                  </p>
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
