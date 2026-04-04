import cn from "classnames";
import {
  ChangeEvent,
  memo,
  ReactNode,
  RefObject,
  useEffect,
  useRef,
  useState,
} from "react";
import { motion } from "framer-motion";
import { useLiveAPIContext } from "@/contexts/LiveAPIContext";
import { UseMediaStreamResult } from "@/hooks/use-media-stream-mux";
import { useScreenCapture } from "@/hooks/use-screen-capture";
import { useWebcam } from "@/hooks/use-webcam";
import {
  ArrowUp,
  Undo2,
  Mic,
  MicOff,
  MonitorOff,
  ScreenShare,
  Square,
  Video,
  VideoOff,
  Paperclip,
} from "lucide-react";
import { AudioRecorder } from "@/lib/live/audio-recorder";
import AudioPulse from "../audio-pulse/AudioPulse";
import "./control-tray.scss";
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputActions,
  PromptInputAction,
} from "../ui/prompt-input";
import { Button } from "../ui/button";
import { Arrow } from "@radix-ui/react-tooltip";
import { Waveform } from "../ui/waveform";
import { useChatStore } from "@/lib/chat/store";
import {
  formatBytesAsMb,
  resolveMimeType,
  validateAttachmentSelection,
} from "@/lib/live/attachment-manager";
import { AttachmentChips, type TrayAttachment } from "./AttachmentChips";
import {
  streamAudioFile,
  streamImageFile,
  streamVideoFile,
} from "@/lib/live/realtime-file-streamer";

export type ControlTrayProps = {
  videoRef: RefObject<HTMLVideoElement>;
  children?: ReactNode;
  supportsVideo: boolean;
  onVideoStreamChange?: (stream: MediaStream | null) => void;
};

type MediaStreamButtonProps = {
  isStreaming: boolean;
  onIcon: ReactNode;
  offIcon: ReactNode;
  disabled?: boolean;
  start: () => Promise<unknown>;
  stop: () => void;
};

/**
 * button used for triggering webcam or screen-capture
 */
const MediaStreamButton = memo(
  ({
    isStreaming,
    onIcon,
    offIcon,
    start,
    stop,
    disabled,
  }: MediaStreamButtonProps) =>
    isStreaming ? (
      <Button
        className=" bg-background text-secondary-foreground hover:bg-secondary h-10 w-10 rounded-2xl font-semibold focus-visible:outline-black"
        variant={"ghost"}
        onClick={stop}
        disabled={disabled}
      >
        {onIcon}
      </Button>
    ) : (
      <Button
        className=" bg-background text-secondary-foreground hover:bg-secondary h-10 w-10 rounded-2xl font-semibold focus-visible:outline-black"
        variant={"ghost"}
        onClick={start}
        disabled={disabled}
      >
        {offIcon}
      </Button>
    ),
);

function ControlTray({
  videoRef,
  children,
  onVideoStreamChange = () => {},
  supportsVideo,
}: ControlTrayProps) {
  const videoStreams = [useWebcam(), useScreenCapture()];
  const [activeVideoStream, setActiveVideoStream] =
    useState<MediaStream | null>(null);
  const [textInput, setTextInput] = useState("");
  const [webcam, screenCapture] = videoStreams;
  const [audioRecorder] = useState(() => new AudioRecorder());
  const [muted, setMuted] = useState(false);
  const [connectionIssue, setConnectionIssue] = useState<string | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<TrayAttachment[]>([]);
  const renderCanvasRef = useRef<HTMLCanvasElement>(null);
  const connectButtonRef = useRef<HTMLButtonElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const attachmentQueueRef = useRef(Promise.resolve());
  const lastInputVolumeRef = useRef(0);
  const lastInputVolumeUIUpdateRef = useRef(0);
  const {
    client,
    connected,
    connect,
    disconnect,
    resumeSession,
    canResume,
    volume,
  } = useLiveAPIContext();
  const addUserText = useChatStore((state) => state.addUserText);
  const addUserAttachment = useChatStore((state) => state.addUserAttachment);
  const updateAttachmentProgress = useChatStore(
    (state) => state.updateAttachmentProgress,
  );
  const finalizeAttachment = useChatStore((state) => state.finalizeAttachment);
  const failAttachment = useChatStore((state) => state.failAttachment);
  const isLoading = false;

  const existingAttachmentFiles = attachments.map((item) => item.file);

  const handleSelectAttachments = (event: ChangeEvent<HTMLInputElement>) => {
    const incoming = Array.from(event.target.files ?? []);
    event.target.value = "";

    if (!incoming.length) {
      return;
    }

    const { accepted, rejected, totalBytes } = validateAttachmentSelection(
      incoming,
      existingAttachmentFiles,
    );

    if (accepted.length) {
      setAttachments((prev) => [
        ...prev,
        ...accepted.map((file) => ({
          id: `${file.name}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
          file,
          status: "queued" as const,
        })),
      ]);
    }

    if (rejected.length) {
      setAttachmentError(rejected.map((item) => item.message).join(" "));
      return;
    }

    if (totalBytes > 0) {
      setAttachmentError(`Attachments ready (${formatBytesAsMb(totalBytes)} selected).`);
    } else {
      setAttachmentError(null);
    }
  };

  const handleOpenAttachmentPicker = () => {
    attachmentInputRef.current?.click();
  };

  const handleRemoveAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((item) => item.id !== id));
  };

  const delay = (ms: number) =>
    new Promise((resolve) => window.setTimeout(resolve, ms));

  const processAttachmentBatch = async (batch: TrayAttachment[]) => {
    let successCount = 0;
    const VIDEO_TURBO = 3;
    const AUDIO_TURBO = 4;
    const MAX_MEDIA_DURATION_SEC = 90;

    for (const attachment of batch) {
      let attachmentMessageId = "";
      try {
        const mimeType = resolveMimeType(attachment.file);
        const previewUrl = URL.createObjectURL(attachment.file);
        const mediaType = mimeType.startsWith("image/")
          ? "image"
          : mimeType.startsWith("video/")
            ? "video"
            : mimeType.startsWith("audio/")
              ? "audio"
              : null;

        if (!mediaType) {
          throw new Error("Coming soon for this file type.");
        }

        attachmentMessageId = addUserAttachment({
          mediaType,
          name: attachment.file.name,
          previewUrl,
        });

        if (mimeType.startsWith("image/")) {
          await streamImageFile(attachment.file, mimeType, client, {
            onProgress: (progress) =>
              updateAttachmentProgress(attachmentMessageId, progress),
          });
        } else if (mimeType.startsWith("video/")) {
          await streamVideoFile(
            attachment.file,
            mimeType,
            client,
            {
              maxDurationSec: MAX_MEDIA_DURATION_SEC,
              turbo: VIDEO_TURBO,
              sampleFps: 1,
            },
            {
              onProgress: (progress) =>
                updateAttachmentProgress(attachmentMessageId, progress),
            },
          );
        } else if (mimeType.startsWith("audio/")) {
          await streamAudioFile(
            attachment.file,
            client,
            {
              maxDurationSec: MAX_MEDIA_DURATION_SEC,
              turbo: AUDIO_TURBO,
              chunkMs: 100,
            },
            {
              onProgress: (progress) =>
                updateAttachmentProgress(attachmentMessageId, progress),
            },
          );
        }

        finalizeAttachment(attachmentMessageId);
        successCount += 1;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Attachment processing failed.";
        if (attachmentMessageId) {
          failAttachment(attachmentMessageId, message);
        }
      }
    }

    const failedCount = batch.length - successCount;
    if (!successCount) {
      setAttachmentError("Could not process attachments. Please try again.");
      return;
    }

    if (failedCount > 0) {
      setAttachmentError(
        `Sent ${successCount} file(s). ${failedCount} failed to process.`,
      );
    }
  };

  const handleSubmit = async () => {
    const trimmed = textInput.trim();
    const hasAttachments = attachments.length > 0;

    if (!connected) {
      setAttachmentError("Turn on voice mode to send messages or attachments.");
      return;
    }

    if (!trimmed && !hasAttachments) {
      return;
    }

    if (!hasAttachments) {
      if (trimmed) {
        addUserText(trimmed);
        client.sendRealtimeText(trimmed);
        setTextInput("");
      }
      return;
    }

    const batch = [...attachments];
    setAttachments([]);
    setAttachmentError(null);

    if (trimmed) {
      addUserText(trimmed);
      setTextInput("");
    }

    attachmentQueueRef.current = attachmentQueueRef.current
      .then(async () => {
        const mediaPromise = processAttachmentBatch(batch);
        if (trimmed) {
          await delay(5000);
          if (connected) {
            client.sendRealtimeText(trimmed);
          }
        }
        await mediaPromise;
      })
      .catch((error) => {
        const message =
          error instanceof Error ? error.message : "Attachment queue failed.";
        setAttachmentError(message);
      });
  };

  // useEffect(() => {
  //   if (!connected && connectButtonRef.current) {
  //     connectButtonRef.current.focus();
  //   }
  // }, [connected]);
  useEffect(() => {
    const onOpen = () => setConnectionIssue(null);
    const onClose = (e: CloseEvent) => {
      const reason = e.reason ? `, reason: ${e.reason}` : "";
      const msg = `Live connection closed (code: ${e.code}, clean: ${e.wasClean}${reason})`;
      setConnectionIssue(msg);
      console.error(`[LiveAPI] ${msg}`);
    };
    const onError = (e: ErrorEvent) => {
      const msg = `Live socket error${e.message ? `: ${e.message}` : ""}`;
      setConnectionIssue(msg);
      console.error(`[LiveAPI] ${msg}`, e);
    };

    client.on("open", onOpen).on("close", onClose).on("error", onError);
    return () => {
      client.off("open", onOpen).off("close", onClose).off("error", onError);
    };
  }, [client]);

  useEffect(() => {
    const onData = (base64: string) => {
      client.sendRealtimeInput([
        {
          mimeType: "audio/pcm;rate=16000",
          data: base64,
        },
      ]);
    };

    const onInputVolume = (value: number) => {
      const nextVolume = Number(value ?? 0);
      const now = performance.now();
      const shouldUpdateUI =
        now - lastInputVolumeUIUpdateRef.current >= 100 ||
        Math.abs(nextVolume - lastInputVolumeRef.current) >= 0.02;

      if (shouldUpdateUI) {
        lastInputVolumeRef.current = nextVolume;
        lastInputVolumeUIUpdateRef.current = now;
        document.documentElement.style.setProperty(
          "--volume",
          `${Math.max(5, Math.min(nextVolume * 200, 8))}px`,
        );
      }
    };

    if (connected && !muted && audioRecorder) {
      audioRecorder.on("data", onData).on("volume", onInputVolume).start();
    } else {
      if (connected) {
        client.sendAudioStreamEnd();
      }
      audioRecorder.stop();
    }
    return () => {
      audioRecorder.off("data", onData).off("volume", onInputVolume);
    };
  }, [connected, client, muted, audioRecorder]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = activeVideoStream;
    }

    let timeoutId = -1;

    function sendVideoFrame() {
      const video = videoRef.current;
      const canvas = renderCanvasRef.current;

      if (!video || !canvas) {
        return;
      }

      const ctx = canvas.getContext("2d")!;
      canvas.width = video.videoWidth * 0.25;
      canvas.height = video.videoHeight * 0.25;
      if (canvas.width + canvas.height > 0) {
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        const base64 = canvas.toDataURL("image/jpeg", 1.0);
        const data = base64.slice(base64.indexOf(",") + 1, Infinity);
        client.sendRealtimeInput([{ mimeType: "image/jpeg", data }]);
      }
      if (connected) {
        timeoutId = window.setTimeout(sendVideoFrame, 1000 / 0.5);
      }
    }
    if (connected && activeVideoStream !== null) {
      requestAnimationFrame(sendVideoFrame);
    }
    return () => {
      clearTimeout(timeoutId);
    };
  }, [connected, activeVideoStream, client, videoRef]);

  //handler for swapping from one video-stream to the next
  const changeStreams = (next?: UseMediaStreamResult) => async () => {
    if (next) {
      const mediaStream = await next.start();
      setActiveVideoStream(mediaStream);
      onVideoStreamChange(mediaStream);
    } else {
      setActiveVideoStream(null);
      onVideoStreamChange(null);
    }

    videoStreams.filter((msr) => msr !== next).forEach((msr) => msr.stop());
  };

  const changeStreamr = (next?: UseMediaStreamResult) => async () => {
    if (next) {
      const mediaStream = await next.start();
      setActiveVideoStream(mediaStream);
    } else {
      setActiveVideoStream(null);
      onVideoStreamChange(null);
    }

    videoStreams.filter((msr) => msr !== next).forEach((msr) => msr.stop());
  };

  return (
    <section className="absolute -translate-x-2/4 translate-y-0 flex flex-col justify-end items-center gap-1 w-[95%] md:w-full pb-[16px] left-2/4 bottom-0">
      <canvas style={{ display: "none" }} ref={renderCanvasRef} />

      {children}

      <PromptInput
        value={textInput}
        onValueChange={setTextInput}
        isLoading={isLoading}
        onSubmit={handleSubmit}
        className="w-full max-w-(--breakpoint-md) text-md"
      >
        <input
          ref={attachmentInputRef}
          type="file"
          multiple
          accept="image/*,audio/*,video/*"
          className="hidden"
          onChange={handleSelectAttachments}
        />
        <PromptInputTextarea placeholder="Turn on the voice mode & Ask me anything..." />
        <AttachmentChips
          attachments={attachments}
          onRemove={handleRemoveAttachment}
          disabled={!connected}
        />
        <PromptInputActions className="flex items-center justify-between gap-2 pt-2">
          <div className="flex items-center gap-x-1.5">
            <PromptInputAction tooltip="Attach image, audio, or video">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Attach files"
                onClick={handleOpenAttachmentPicker}
                className="border-input bg-background text-secondary-foreground hover:bg-secondary h-9 w-9 rounded-full border p-1 text-xs font-semibold focus-visible:outline-black [&_svg]:size-[18px]"
                disabled={!connected}
              >
                <Paperclip className="size-5" />
              </Button>
            </PromptInputAction>
            <PromptInputAction
              delayDuration={0}
              className="duration-0 data-[state=closed]:duration-0"
              open={connected ? false : undefined}
              tooltip={
                <div className="bg-black">
                  <Arrow className="fill-black" />
                  <span className="text-xs leading-none font-semibold text-white">
                    Voice mode
                  </span>
                </div>
              }
            >
              <div
                className={cn(
                  "flex [&_svg]:shrink-0 items-center justify-center border rounded-full border-input ",
                  { disabled: !connected },
                )}
              >
                <button
                  ref={connectButtonRef}
                  onClick={connected ? disconnect : connect}
                  aria-label="Voice Mode"
                  className="flex items-center justify-center  bg-background text-secondary-foreground hover:bg-secondary h-10 w-10 rounded-full font-semibold focus-visible:outline-black"
                >
                  {connected ? (
                    <AudioPulse
                      volume={volume}
                      active={connected}
                      hover={false}
                    />
                  ) : (
                    <Waveform />
                  )}
                </button>
                {connected && (
                  <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.5, ease: "easeOut" }}
                    className="flex gap-2 px-4.5"
                  >
                    <Button
                      variant="ghost"
                      className=" bg-background text-secondary-foreground hover:bg-secondary h-10 w-10 rounded-2xl font-semibold focus-visible:outline-black"
                      onClick={() => setMuted(!muted)}
                      disabled={!connected}
                    >
                      {!muted ? (
                        <Mic className="size-5.5" />
                      ) : (
                        <MicOff className="size-5.5" />
                      )}
                    </Button>
                    {supportsVideo && (
                      <>
                        <MediaStreamButton
                          isStreaming={screenCapture.isStreaming}
                          start={changeStreamr(screenCapture)}
                          stop={changeStreams()}
                          disabled={!connected}
                          onIcon={<MonitorOff className="size-5.5" />}
                          offIcon={<ScreenShare className="size-5.5" />}
                        />
                        <MediaStreamButton
                          isStreaming={webcam.isStreaming}
                          start={changeStreams(webcam)}
                          stop={changeStreams()}
                          disabled={!connected}
                          onIcon={<Video className="size-5.5" />}
                          offIcon={<VideoOff className="size-5.5" />}
                        />
                      </>
                    )}
                  </motion.div>
                )}
              </div>
            </PromptInputAction>
            {!connected && canResume && (
              <PromptInputAction
                delayDuration={0}
                className="duration-0 data-[state=closed]:duration-0"
                tooltip={
                  <div className="bg-black">
                    <Arrow className="fill-black" />
                    <span className="text-xs leading-none font-semibold text-white">
                      Resume session
                    </span>
                  </div>
                }
              >
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Resume session"
                  onClick={resumeSession}
                  className="border-input bg-background text-secondary-foreground hover:bg-secondary h-9 w-9 rounded-full border p-1 text-xs font-semibold focus-visible:outline-black [&_svg]:size-[18px]"
                >
                  <Undo2 className="size-6" />
                </Button>
              </PromptInputAction>
            )}
          </div>
          <PromptInputAction
            tooltip={isLoading ? "Stop generation" : "Send message"}
          >
            <Button
              variant="default"
              size="icon"
              className="h-10 w-10 rounded-full"
              onClick={handleSubmit}
              disabled={!connected}
            >
              {isLoading ? (
                <Square className="size-5.5 fill-current" />
              ) : (
                <ArrowUp className="size-5.5" />
              )}
            </Button>
          </PromptInputAction>
        </PromptInputActions>
      </PromptInput>
      {connectionIssue && (
        <div className="w-full max-w-(--breakpoint-md) px-3 text-[11px] text-red-500">
          {connectionIssue}
        </div>
      )}
      {attachmentError && (
        <div className="w-full max-w-(--breakpoint-md) px-3 text-[11px] text-zinc-600">
          {attachmentError}
        </div>
      )}
    </section>
  );
}

export default memo(ControlTray);
