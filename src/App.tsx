import cn from "classnames";
import { Minimize2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LiveAPIProvider } from "./contexts/LiveAPIContext";
import ControlTray from "./components/control-tray/ControlTray";
import { LiveClientOptions } from "./lib/live/types";
import { ChatScreen } from "./components/chat/ChatScreen";
import { MarkdownBoardPanel } from "./components/chat/MarkdownBoardPanel";

const TOKEN_SERVER_URL =
  (import.meta.env.VITE_GEMINI_TOKEN_SERVER_URL as string | undefined) ??
  "https://gemini-live-token-server.simpelskiff.workers.dev/token";
const TOKEN_BYPASS_KEY =
  import.meta.env.VITE_GEMINI_TOKEN_BYPASS_KEY as string | undefined;

const apiOptions: LiveClientOptions = {
  apiVersion: "v1alpha",
  getEphemeralToken: async () => {
    const response = await fetch(TOKEN_SERVER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(TOKEN_BYPASS_KEY
          ? { "x-live-token-key": TOKEN_BYPASS_KEY }
          : {}),
      },
      body: JSON.stringify({
        model: "gemini-3.1-flash-live-preview",
      }),
    });

    if (!response.ok) {
      const details = await response.text();
      throw new Error(
        `Failed to fetch ephemeral token (${response.status}): ${details}`,
      );
    }

    const body = (await response.json()) as {
      token?: string;
      expireTime?: string;
      newSessionExpireTime?: string;
    };
    if (!body.token) {
      throw new Error("Token endpoint returned no token");
    }

    return {
      token: body.token,
      expireTime: body.expireTime,
      newSessionExpireTime: body.newSessionExpireTime,
    };
  },
};

type CameraStartSource = "user" | "agent_snapshot" | "board_scan" | null;

type CameraUiState = {
  isOverlayVisible: boolean;
  lastStartSource: CameraStartSource;
  inlinePlaybackVisible: boolean;
  startedBySnapshotTool: boolean;
};

function FloatingCameraPreview({
  stream,
  visible,
  onClose,
}: {
  stream: MediaStream | null;
  visible: boolean;
  onClose: () => void;
}) {
  const overlayVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (overlayVideoRef.current) {
      overlayVideoRef.current.srcObject = stream;
    }
  }, [stream]);

  if (!stream || !visible) {
    return null;
  }

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[90]">
      <div className="absolute inset-0 bg-black/25 backdrop-blur-[2px]" />
      <div className="absolute inset-0 flex items-center justify-center p-4 md:p-6 lg:p-10">
        <div className="pointer-events-auto flex max-h-[calc(100vh-2rem)] w-full max-w-6xl flex-col overflow-hidden rounded-[2rem] border border-white/60 bg-white/92 shadow-[0_24px_80px_rgba(15,23,42,0.24)] backdrop-blur-xl md:max-h-[calc(100vh-3rem)] lg:max-h-[calc(100vh-5rem)]">
          <div className="flex items-center justify-between border-b border-zinc-200/80 px-4 py-3 md:px-5">
            <p className="text-sm font-semibold text-zinc-900 md:text-base">
              Camera
            </p>
            <button
              type="button"
              aria-label="Minimize camera overlay"
              onClick={onClose}
              className="rounded-md p-1.5 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900"
            >
              <Minimize2 className="size-4" />
            </button>
          </div>
          <div className="flex-1 bg-[linear-gradient(135deg,rgba(241,245,249,0.92),rgba(226,232,240,0.72))] p-3 md:p-5">
            <div className="flex h-full max-h-full items-center justify-center overflow-hidden rounded-[1.5rem] border border-zinc-200/70 bg-zinc-950 p-2 md:p-3">
              <video
                ref={overlayVideoRef}
                autoPlay
                playsInline
                muted
                className="aspect-video max-h-full w-full rounded-[1.1rem] bg-black object-cover"
              />
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function App() {
  const videoRef = useRef<HTMLVideoElement>(
    null,
  ) as React.RefObject<HTMLVideoElement>;
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
  const [isSnapshotGlowActive, setIsSnapshotGlowActive] = useState(false);
  const [cameraUi, setCameraUi] = useState<CameraUiState>({
    isOverlayVisible: false,
    lastStartSource: null,
    inlinePlaybackVisible: false,
    startedBySnapshotTool: false,
  });
  const horizontalPaneRef = useRef<HTMLDivElement>(null);
  const snapshotGlowTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const container = horizontalPaneRef.current;
    if (!container) {
      return;
    }

    const onWheel = (event: WheelEvent) => {
      if (!event.shiftKey || event.deltaY === 0) {
        return;
      }

      event.preventDefault();
      container.scrollLeft += event.deltaY * 15;
    };

    container.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      container.removeEventListener("wheel", onWheel);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (snapshotGlowTimeoutRef.current !== null) {
        window.clearTimeout(snapshotGlowTimeoutRef.current);
      }
    };
  }, []);

  const triggerSnapshotGlow = () => {
    if (snapshotGlowTimeoutRef.current !== null) {
      window.clearTimeout(snapshotGlowTimeoutRef.current);
    }

    setIsSnapshotGlowActive(false);
    window.requestAnimationFrame(() => {
      setIsSnapshotGlowActive(true);
      snapshotGlowTimeoutRef.current = window.setTimeout(() => {
        setIsSnapshotGlowActive(false);
        snapshotGlowTimeoutRef.current = null;
      }, 1000);
    });
  };

  const handleVideoStreamChange = (stream: MediaStream | null) => {
    setVideoStream(stream);
    setCameraUi((current) => ({
      ...current,
      inlinePlaybackVisible: Boolean(stream),
      isOverlayVisible: stream ? current.isOverlayVisible : false,
      startedBySnapshotTool: stream ? current.startedBySnapshotTool : false,
    }));
  };

  const handleCameraStarted = (source: Exclude<CameraStartSource, null>) => {
    setCameraUi({
      isOverlayVisible: true,
      lastStartSource: source,
      inlinePlaybackVisible: true,
      startedBySnapshotTool: source === "agent_snapshot",
    });
  };

  const handleCameraStopped = () => {
    setCameraUi((current) => ({
      ...current,
      isOverlayVisible: false,
      inlinePlaybackVisible: false,
      startedBySnapshotTool: false,
    }));
  };

  return (
    <div className="App">
      <LiveAPIProvider options={apiOptions}>
        <div className="relative h-screen w-full overflow-hidden bg-[#e0ecf46d] ">
          <div
            aria-hidden="true"
            className={cn("snapshot-glow-overlay", {
              "snapshot-glow-overlay--active": isSnapshotGlowActive,
            })}
          />
          <div
            ref={horizontalPaneRef}
            className="h-full overflow-x-auto overflow-y-hidden scroll-smooth"
          >
            <div className="flex h-full w-[200vw]">
              <section className="h-full w-screen shrink-0 overflow-y-auto">
                <div className="flex flex-col items-center pb-28">
                  <ChatScreen />
                  <video
                    className={cn(
                      "mb-8 mt-3 max-h-[fit-content] max-w-[90%] flex-grow rounded-[32px]",
                      {
                        hidden:
                          !videoRef.current ||
                          !videoStream ||
                          !cameraUi.inlinePlaybackVisible,
                      },
                    )}
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                  />
                </div>
              </section>

              <MarkdownBoardPanel />
            </div>
          </div>

          <FloatingCameraPreview
            stream={videoStream}
            visible={cameraUi.isOverlayVisible}
            onClose={() =>
              setCameraUi((current) => ({
                ...current,
                isOverlayVisible: false,
              }))
            }
          />

          <div className="invisible md:visible lg:visible pointer-events-none fixed right-4 top-4 z-30 rounded-full bg-white/80 px-3 py-1 text-[11px] font-medium text-zinc-600 shadow-sm">
            Shift + Scroll to open board
          </div>

          <ControlTray
            videoRef={videoRef}
            supportsVideo={true}
            onVideoStreamChange={handleVideoStreamChange}
            onCameraStarted={handleCameraStarted}
            onCameraStopped={handleCameraStopped}
            onSnapshotGlow={triggerSnapshotGlow}
          />
        </div>
      </LiveAPIProvider>
    </div>
  );
}

export default App;
