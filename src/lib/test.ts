import {
  GoogleGenAI,
  FunctionCallingConfigMode,
  mcpToTool,
} from "@google/genai";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const API_KEY = process.env.VITE_GEMINI_API_KEY;
if (!API_KEY) {
  throw new Error(
    "VITE_GEMINI_API_KEY environment variable is not set. Please set it in your .env file."
  );
}

// Create server parameters for stdio connection
const serverParams = new StdioClientTransport({
  command: "npx", // Executable
  args: ["-y", "chrome-devtools-mcp@latest"], // MCP Server
});

const client = new Client({
  name: "example-client",
  version: "1.0.0",
});

// Configure the client with API key
const ai = new GoogleGenAI({
  apiKey: API_KEY,
});

// Initialize the connection between client and server
await client.connect(serverParams);

// Send request to the model with MCP tools
const response = await ai.models.generateContent({
  model: "gemini-2.5-flash",
  contents: `open new chrome tab and go to amazon.in and give me top 5 smart watches below 2000`,
  config: {
    tools: [mcpToTool(client)], // uses the session, will automatically call the tool
    // Uncomment if you **don't** want the sdk to automatically call the tool
    // automaticFunctionCalling: {
    //   disable: true,
    // },
  },
});
console.log(response.text);

// Close the connection
await client.close();
