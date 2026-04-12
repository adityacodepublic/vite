import cn from "classnames";
import { useEffect, useRef, useState } from "react";
import { LiveAPIProvider } from "./contexts/LiveAPIContext";
import ControlTray, {
  type ControlTrayHandle,
} from "./components/control-tray/ControlTray";
import { LiveClientOptions } from "./lib/live/types";
import { ChatScreen } from "./components/chat/ChatScreen";
import { MarkdownBoardPanel } from "./components/chat/MarkdownBoardPanel";

// import SidePanel from "./components/side-panel/SidePanel";
//import { addTransaction, fetchUserBalance, p2pTransfer } from "./lib/toolcall/functions";
//console.log(await addTransaction(106, 500, "debit", "user 102 sent money to 106."));
//console.log(await addTransaction(102, 500, "credit", "user 102 recieved money from 106."));
//console.log(await p2pTransfer(106,102,500,"testing transfer"));
//console.log(await fetchUserBalance(106))

// const host = "generativelanguage.googleapis.com";
// const uri = `wss://${host}/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent`;

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY as string;
if (typeof API_KEY !== "string") {
  throw new Error("set VITE_GEMINI_APIK_KEY in .env");
}

const apiOptions: LiveClientOptions = {
  apiKey: API_KEY,
};

function App() {
  // this video reference is used for displaying the active stream, whether that is the webcam or screen capture
  // feel free to style as you see fit
  const videoRef = useRef<HTMLVideoElement>(
    null,
  ) as React.RefObject<HTMLVideoElement>;
  // either the screen capture, the video or null, if null we hide it
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
  const [isSnapshotGlowActive, setIsSnapshotGlowActive] = useState(false);
  const horizontalPaneRef = useRef<HTMLDivElement>(null);
  const controlTrayRef = useRef<ControlTrayHandle | null>(null);
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
          {/* <SidePanel /> */}
          <div
            ref={horizontalPaneRef}
            className="h-full overflow-x-auto overflow-y-hidden scroll-smooth"
          >
            <div className="flex h-full w-[200vw]">
              <section className="h-full w-screen shrink-0 overflow-y-auto">
                <div className="flex flex-col items-center pb-20">
                  <ChatScreen />
                  <video
                    className={cn(
                      "mt-2 max-h-[fit-content] max-w-[90%] flex-grow rounded-[32px]",
                      {
                        hidden: !videoRef.current || !videoStream,
                      },
                    )}
                    ref={videoRef}
                    autoPlay
                    playsInline
                  />
                </div>
              </section>

              <MarkdownBoardPanel
                videoStream={videoStream}
                controlTrayRef={controlTrayRef}
              />
            </div>
          </div>

          <div className="invisible md:visible lg:visible pointer-events-none fixed right-4 top-4 z-30 rounded-full bg-white/80 px-3 py-1 text-[11px] font-medium text-zinc-600 shadow-sm">
            Shift + Scroll to open board
          </div>

          <ControlTray
            ref={controlTrayRef}
            videoRef={videoRef}
            supportsVideo={true}
            onVideoStreamChange={setVideoStream}
            onSnapshotGlow={triggerSnapshotGlow}
          />
        </div>
      </LiveAPIProvider>
    </div>
  );
}

export default App;
