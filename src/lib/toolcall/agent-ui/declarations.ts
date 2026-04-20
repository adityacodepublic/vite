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
      "List the currently visible and enabled UI components that are explicitly registered for agent interaction. Always call this immediately before interact_agent_ui to get latest data, and only act on components returned here.",
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
  {
    name: "interact_agent_ui",
    description:
      "Perform a safe UI interaction on a currently listed component. Supported actions are click, full_write, and key. Call list_agent_ui first, then only act on a component returned by that latest list. Do not invent component names. you can use it to open cards, interact with chat tray etc.",
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
            "Required when action is key. Must be one of the keys declared by list_agent_ui.",
        },
      },
      required: ["component", "action"],
    },
  },
];
