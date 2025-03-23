import { useEffect, useRef, useState, memo } from "react";
import { useLiveAPIContext } from "../../contexts/LiveAPIContext";
import { ToolCall } from "../../multimodal-live-types";
import vegaEmbed from "vega-embed";
import { declaration, functionsmap } from "../../lib/toolcall/declerations";
import Header from "../header/header";
import NavButtons from "../buttons/buttons";

function BankDetailsComponent() {
  const [tool, setTool] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);

  const [name, setName] = useState("");
  const [trigger, setTrigger] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const { client, setConfig } = useLiveAPIContext();

  useEffect(() => {
    setConfig({
      model: "models/gemini-2.0-flash-exp",
      generationConfig: {
        responseModalities: "audio",
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } },
        },
      },
      systemInstruction: {
        parts: [
          {
            text: `
**You are my document analysis agent.**  

- I will share my screen with you. If you cannot view my screen, let me know by saying, **"Please turn on the screen."**  
- Remember and store all documents and text visible on my screen.  
- Only respond when I ask a question—do not comment on every page interaction.  
- When I ask a question about the documents, answer concisely and accurately.  
- Do not repeatedly describe or summarize what you see—just answer my questions based on the stored information.    
- Dont hallucinate or give false information if you dont know or need more information tell so
- Understand the user's question, needs and expectations accurately before responding or taking necessary actions`,
            // 'You are my financial assistant.Your Job is to provide most truthful finance advice to me you will not state any bad advice or if there are any risk in your advice you will state them. Any time I ask you for a graph call the "render_altair" function I have provided you. Dont ask for additional information just make your best judgement. if possible, use the previous responses by the user or functions to answer. At the start greet the user have a talk if user starts a talk and then, before user asks anything related to his bank related things, ask him his userid and user name, then fetch his bankdetails from "fetchBankDetails" and verify the name and user id, if verified then continue with conversation or ask the userid and user name again. remember user id as it would be useful further. '
          },
        ],
      },
      tools: [
        // there is a free-tier quota for search and code execution
        { googleSearch: {} },
        { functionDeclarations: declaration },
      ],
    });
  }, [setConfig]);

  useEffect(() => {
    const onToolCall = async (toolCall: ToolCall) => {
      console.log(`got toolcall`, toolCall);
      let response: any;
      const fc = toolCall.functionCalls.find((fc) =>
        declaration.some((decl) => decl.name === fc.name)
      );
      if (fc) {
        setTool(fc.name);
        try {
          setIsLoading(true);
          response = await functionsmap[fc.name](fc.args);
          console.log(response);
        } catch (error) {
          console.error(error);
        } finally {
          setIsLoading(false);
          setData(response);
        }
      }

      if (toolCall.functionCalls.length) {
        setTimeout(
          () =>
            client.sendToolResponse({
              functionResponses: toolCall.functionCalls.map((fc) => ({
                id: fc.id,
                name: fc.name,
                response: { output: response },
              })),
            }),
          100
        );
      }
    };
    setTrigger(false);
    client.on("toolcall", onToolCall);
    return () => {
      client.off("toolcall", onToolCall);
    };
  }, [client, trigger]); // Re-fetch when shouldFetch or name changes

  const embedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (
      embedRef.current &&
      typeof data === "string" &&
      tool === "render_altair"
    ) {
      vegaEmbed(embedRef.current, JSON.parse(data));
    }
    setData(null);
  }, [embedRef, data]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTrigger(true);
  };

  const displayData = () => {
    if (isLoading) {
      return <p>Loading bank details...</p>;
    }

    if (data) {
      return <div>{JSON.stringify(data)}</div>;
    }

    if (tool === "fetchBan")
      return (
        <form onSubmit={handleSubmit}>
          <label htmlFor="name">Enter your name:</label>
          <input
            type="text"
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button type="submit">Fetch Details</button>
        </form>
      );
    else return null;
  };

  //console.log(data);
  return (
    <div>
      <div className="vega-embed" ref={embedRef} />
      {displayData()}
    </div>
  );
}

export const BankDetails = memo(BankDetailsComponent);
