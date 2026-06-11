import { type FunctionDeclaration, Type } from "@google/genai";
import { interactAgentUi, listAgentUi } from "./functions";

export const agentUiFunctionsMap: Record<string, any> = {
  list_agent_ui: () => {
    return listAgentUi(document);
  },
  interact_agent_ui: (args: {
    component?: string;
    action?: string;
    text?: string;
    key?: string;
  }) => {
    return interactAgentUi(args, document);
  },
};

export const agentUiDeclarations: FunctionDeclaration[] = [
  {
    name: "list_agent_ui",
    description:
      "List the currently visible and enabled UI components that are explicitly registered for agent interaction. The data keeps on changing as you or the user interacts with the page, so call this to get the latest components list. If you dont know if certain functionality or component exists you can also call this tool to check it.",
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
  {
    name: "interact_agent_ui",
    description:
      "Perform a safe UI interaction on listed component list given by list_agent_ui. Supported actions are click, full_write, and keyboard keys. Do not invent component names. you can use it to open cards by clicking them, interact with chat tray etc.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        component: {
          type: Type.STRING,
          description: "Flat unique component name returned by list_agent_ui.",
        },
        action: {
          type: Type.STRING,
          description: "Interaction to perform on the component.",
          enum: ["click", "full_write", "key"],
        },
        text: {
          type: Type.STRING,
          description:
            "Required when action is full_write. Replaces the component text completely.",
        },
        key: {
          type: Type.STRING,
          description:
            "Required when action is a keyboard key press. Must be one of the keys declared by list_agent_ui.",
        },
      },
      required: ["component", "action"],
    },
  },
];
