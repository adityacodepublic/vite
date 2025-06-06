import cn from "classnames";
import { useRef, useState } from "react";
import { BankDetails } from "./components/bank/Bank";
// import SidePanel from "./components/side-panel/SidePanel";
import { LiveAPIProvider } from "./contexts/LiveAPIContext";
import ControlTray from "./components/control-tray/ControlTray";

//import { addTransaction, fetchUserBalance, p2ptransfer } from "./lib/toolcall/functions";
//console.log(await addTransaction(106, 500, "debit", "user 102 sent money to 106."));
//console.log(await addTransaction(102, 500, "credit", "user 102 recieved money from 106."));
//console.log(await p2ptransfer(106,102,500,"testing transfer"));
//console.log(await fetchUserBalance(106))

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY as string;
if (typeof API_KEY !== "string") {
  throw new Error("set VITE_GEMINI_APIK_KEY in .env");
}

const host = "generativelanguage.googleapis.com";
const uri = `wss://${host}/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent`;

function App() {
  // this video reference is used for displaying the active stream, whether that is the webcam or screen capture
  // feel free to style as you see fit
  const videoRef = useRef<HTMLVideoElement>(null);
  // either the screen capture, the video or null, if null we hide it
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);

  return (
    <div className="App">
      <LiveAPIProvider url={uri} apiKey={API_KEY}>
        <div className=" bg-[#e0ecf46d] text-gray-300 flex justify-center h-screen w-full overflow-y-scroll">
          {/* <SidePanel /> */}
          <div>
            <div className="flex items-center flex-col mt-2 pb-20">
              {/* APP goes here */}
              <BankDetails />
              <video
                className={cn(
                  "flex-grow max-w-[90%] rounded-[32px] max-h-[fit-content] mt-2",
                  {
                    hidden: !videoRef.current || !videoStream,
                  }
                )}
                ref={videoRef}
                autoPlay
                playsInline
              />
            </div>
          </div>

          <ControlTray
            videoRef={videoRef}
            supportsVideo={true}
            onVideoStreamChange={setVideoStream}
          />
        </div>
      </LiveAPIProvider>
    </div>
  );
}

export default App;
