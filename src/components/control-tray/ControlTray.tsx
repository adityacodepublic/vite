import cn from "classnames";
import { memo, ReactNode, RefObject, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useLiveAPIContext } from "@/contexts/LiveAPIContext";
import { UseMediaStreamResult } from "@/hooks/use-media-stream-mux";
import { useScreenCapture } from "@/hooks/use-screen-capture";
import { useWebcam } from "@/hooks/use-webcam";
import {
  ArrowUp,
  Ellipsis,
  Mic,
  MicOff,
  MonitorOff,
  ScreenShare,
  Square,
  Video,
  VideoOff,
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
  start: () => Promise<any>;
  stop: () => any;
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
        className=" bg-background text-secondary-foreground hover:bg-secondary h-11 w-11 rounded-2xl font-semibold focus-visible:outline-black"
        onClick={stop}
        disabled={disabled}
      >
        {onIcon}
      </Button>
    ) : (
      <Button
        className=" bg-background text-secondary-foreground hover:bg-secondary h-11 w-11 rounded-2xl font-semibold focus-visible:outline-black"
        onClick={start}
        disabled={disabled}
      >
        {offIcon}
      </Button>
    )
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
  const [inVolume, setInVolume] = useState(0);
  const [audioRecorder] = useState(() => new AudioRecorder());
  const [muted, setMuted] = useState(false);
  const renderCanvasRef = useRef<HTMLCanvasElement>(null);
  const connectButtonRef = useRef<HTMLButtonElement>(null);
  const { client, connected, connect, disconnect, volume } =
    useLiveAPIContext();
  const isLoading = false;
  const handleSubmit = () => {
    client.send([{ text: textInput }]);

    setTextInput("");
  };

  useEffect(() => {
    if (!connected && connectButtonRef.current) {
      connectButtonRef.current.focus();
    }
  }, [connected]);
  useEffect(() => {
    document.documentElement.style.setProperty(
      "--volume",
      `${Math.max(5, Math.min(inVolume * 200, 8))}px`
    );
  }, [inVolume]);

  useEffect(() => {
    const onData = (base64: string) => {
      client.sendRealtimeInput([
        {
          mimeType: "audio/pcm;rate=16000",
          data: base64,
        },
      ]);
    };
    if (connected && !muted && audioRecorder) {
      audioRecorder.on("data", onData).on("volume", setInVolume).start();
    } else {
      audioRecorder.stop();
    }
    return () => {
      audioRecorder.off("data", onData).off("volume", setInVolume);
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
    <section className="control-tray">
      <canvas style={{ display: "none" }} ref={renderCanvasRef} />

      {children}

      <PromptInput
        value={textInput}
        onValueChange={setTextInput}
        isLoading={isLoading}
        onSubmit={handleSubmit}
        className="w-full max-w-(--breakpoint-md) text-md"
      >
        <PromptInputTextarea placeholder="Ask me anything..." />
        <PromptInputActions className="flex items-center justify-between gap-2 pt-2">
          <div className="flex items-center gap-x-1.5">
            <PromptInputAction
              delayDuration={0}
              className="duration-0 data-[state=closed]:duration-0"
              open={connected ? false : undefined}
              tooltip={
                !connected ? (
                  <div className="bg-black">
                    <Arrow className="fill-black" />
                    <span className="text-xs leading-none font-semibold text-white">
                      Voice mode
                    </span>
                  </div>
                ) : undefined
              }
            >
              <div
                className={cn(
                  "flex [&_svg]:shrink-0 items-center justify-center border rounded-full border-input ",
                  { disabled: !connected },
                  connected ? "pl-1" : "pl-0"
                )}
              >
                <button
                  ref={connectButtonRef}
                  onClick={connected ? disconnect : connect}
                  aria-label="Voice Mode"
                  className="flex items-center justify-center  bg-background text-secondary-foreground hover:bg-secondary h-11 w-11 rounded-full font-semibold focus-visible:outline-black"
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
                    className="flex gap-2 px-3"
                  >
                    <Button
                      variant="ghost"
                      className=" bg-background text-secondary-foreground hover:bg-secondary h-11 w-11 rounded-2xl font-semibold focus-visible:outline-black"
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
            <PromptInputAction
              delayDuration={0}
              className="duration-0 data-[state=closed]:duration-0"
              tooltip={
                <div className="bg-black">
                  <Arrow className="fill-black" />
                  <span className="text-xs leading-none font-semibold text-white">
                    View tools
                  </span>
                </div>
              }
            >
              <Button
                variant="ghost"
                size="icon"
                aria-label="View tools"
                className="border-input bg-background text-secondary-foreground hover:bg-secondary h-9 w-9 rounded-full border p-1 text-xs font-semibold focus-visible:outline-black [&_svg]:size-[18px]"
              >
                <Ellipsis className="size-6" />
              </Button>
            </PromptInputAction>
          </div>
          <PromptInputAction
            tooltip={isLoading ? "Stop generation" : "Send message"}
          >
            <Button
              variant="default"
              size="icon"
              className="h-10 w-10 rounded-full"
              onClick={handleSubmit}
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
    </section>
  );
}

export default memo(ControlTray);
