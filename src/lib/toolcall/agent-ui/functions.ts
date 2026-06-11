export type AgentUiActionName = "click" | "full_write" | "key";

export type AgentUiActionInput = null | {
  type: "string";
  allowed?: string[];
};

export type AgentUiActionDescriptor = {
  name: AgentUiActionName;
  description: string;
  input: AgentUiActionInput;
};

export type AgentUiComponentDescriptor = {
  component: string;
  tagName: string;
  actions: AgentUiActionDescriptor[];
};

export type AgentUiScanResult = {
  components: AgentUiComponentDescriptor[];
  warnings: string[];
};

export type AgentUiActionFailureCode =
  | "not_found"
  | "ambiguous"
  | "not_visible"
  | "disabled"
  | "invalid_action"
  | "invalid_input"
  | "unsupported_element";

export type AgentUiDiff = {
  addedComponents: AgentUiComponentDescriptor[];
  removedComponents: AgentUiComponentDescriptor[];
};

export type AgentUiActionSuccess = {
  ok: true;
  component: string;
  action: AgentUiActionName;
  summary: string;
  uiDiff?: AgentUiDiff;
};

export type AgentUiActionFailure = {
  ok: false;
  code: AgentUiActionFailureCode;
  message: string;
};

export type AgentUiActionResult = AgentUiActionSuccess | AgentUiActionFailure;

export type AgentUiActionArgs = {
  component?: string;
  action?: string;
  text?: string;
  key?: string;
};

type ParsedAgentUiRegistration = {
  component: string;
  element: HTMLElement;
  tagName: string;
  actions: AgentUiActionDescriptor[];
  allowedKeys: string[];
  issues: string[];
};

type AgentUiCandidate = {
  component: string;
  element: HTMLElement;
};

const AGENT_UI_ACTIONS: AgentUiActionName[] = ["click", "full_write", "key"];

const AGENT_UI_ACTION_SET = new Set<AgentUiActionName>(AGENT_UI_ACTIONS);

const UNSUPPORTED_INPUT_TYPES = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "hidden",
  "image",
  "radio",
  "range",
  "reset",
  "submit",
]);

function isAgentUiActionName(value: string): value is AgentUiActionName {
  return AGENT_UI_ACTION_SET.has(value as AgentUiActionName);
}

function actionAttributeSuffix(action: AgentUiActionName) {
  return action.replaceAll("_", "-");
}

function createInvalidInput(message: string): AgentUiActionFailure {
  return {
    ok: false,
    code: "invalid_input",
    message,
  };
}

function createInvalidAction(message: string): AgentUiActionFailure {
  return {
    ok: false,
    code: "invalid_action",
    message,
  };
}

function getAgentUiCandidates(targetDocument: Document): AgentUiCandidate[] {
  const elements = Array.from(
    targetDocument.querySelectorAll<HTMLElement>("[data-agent-component]"),
  );

  return elements
    .map((element) => ({
      component: element.getAttribute("data-agent-component")?.trim() ?? "",
      element,
    }))
    .filter((candidate) => candidate.component.length > 0);
}

function getDuplicateComponentNames(candidates: AgentUiCandidate[]) {
  const counts = new Map<string, number>();

  candidates.forEach(({ component }) => {
    counts.set(component, (counts.get(component) ?? 0) + 1);
  });

  return new Set(
    Array.from(counts.entries())
      .filter(([, count]) => count > 1)
      .map(([component]) => component),
  );
}

function parseCommaSeparatedAttr(
  value: string | null,
  {
    dedupe = false,
  }: {
    dedupe?: boolean;
  } = {},
) {
  const items = (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (!dedupe) {
    return items;
  }

  return Array.from(new Set(items));
}

function parseAgentUiRegistration(
  component: string,
  element: HTMLElement,
): ParsedAgentUiRegistration {
  const issues: string[] = [];
  const rawActions = parseCommaSeparatedAttr(
    element.getAttribute("data-agent-actions"),
  );

  if (!rawActions.length) {
    issues.push(
      `Component '${component}' is missing a valid data-agent-actions list.`,
    );
  }

  const uniqueActionCount = new Set(rawActions).size;
  if (uniqueActionCount !== rawActions.length) {
    issues.push(
      `Component '${component}' declares duplicate actions in data-agent-actions.`,
    );
  }

  const normalizedActions: AgentUiActionName[] = [];

  rawActions.forEach((action) => {
    if (!isAgentUiActionName(action)) {
      issues.push(
        `Component '${component}' declares unsupported action '${action}'.`,
      );
      return;
    }

    normalizedActions.push(action);
  });

  const allowedKeys = normalizedActions.includes("key")
    ? parseCommaSeparatedAttr(element.getAttribute("data-agent-key-allowed"), {
        dedupe: true,
      })
    : [];

  if (normalizedActions.includes("key") && !allowedKeys.length) {
    issues.push(
      `Component '${component}' registers key without data-agent-key-allowed.`,
    );
  }

  const actions = normalizedActions.map<AgentUiActionDescriptor>((action) => {
    const descriptionAttr = `data-agent-desc-${actionAttributeSuffix(action)}`;
    const description = element.getAttribute(descriptionAttr)?.trim() ?? "";

    if (!description) {
      issues.push(`Component '${component}' is missing ${descriptionAttr}.`);
    }

    if (action === "click") {
      return {
        name: action,
        description,
        input: null,
      };
    }

    if (action === "full_write") {
      return {
        name: action,
        description,
        input: { type: "string" },
      };
    }

    return {
      name: action,
      description,
      input: { type: "string", allowed: allowedKeys },
    };
  });

  return {
    component,
    element,
    tagName: element.tagName,
    actions,
    allowedKeys,
    issues,
  };
}

function isElementVisible(element: HTMLElement) {
  if (!element.isConnected || element.hidden) {
    return false;
  }

  const computedStyle =
    element.ownerDocument.defaultView?.getComputedStyle(element);

  if (computedStyle) {
    if (computedStyle.display === "none") {
      return false;
    }

    if (
      computedStyle.visibility === "hidden" ||
      computedStyle.visibility === "collapse"
    ) {
      return false;
    }
  }

  const rects = Array.from(element.getClientRects());

  if (!rects.length) {
    return false;
  }

  return rects.some((rect) => rect.width > 0 && rect.height > 0);
}

function isElementDisabled(element: HTMLElement) {
  return (
    element.matches(":disabled") ||
    element.getAttribute("aria-disabled") === "true"
  );
}

function focusElement(element: HTMLElement) {
  if (typeof element.focus === "function") {
    element.focus();
  }
}

function setFormControlValue(
  element: HTMLInputElement | HTMLTextAreaElement,
  value: string,
) {
  const prototype =
    element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");

  if (descriptor?.set) {
    descriptor.set.call(element, value);
    return;
  }

  element.value = value;
}

function isSupportedInputElement(element: HTMLInputElement) {
  return !UNSUPPORTED_INPUT_TYPES.has(element.type);
}

function writeElementText(element: HTMLElement, text: string) {
  focusElement(element);

  if (element instanceof HTMLTextAreaElement) {
    setFormControlValue(element, text);
  } else if (element instanceof HTMLInputElement) {
    if (!isSupportedInputElement(element)) {
      return false;
    }
    setFormControlValue(element, text);
  } else if (element.isContentEditable) {
    element.textContent = text;
  } else {
    return false;
  }

  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

function getKeyTarget(element: HTMLElement) {
  focusElement(element);

  const activeElement = element.ownerDocument.activeElement;
  if (activeElement instanceof HTMLElement && element.contains(activeElement)) {
    return activeElement;
  }

  return element;
}

function buildDuplicateWarning(component: string) {
  return `Component '${component}' is registered multiple times and was omitted from list_agent_ui.`;
}

function scanAgentUi(targetDocument: Document = document): AgentUiScanResult {
  const warnings: string[] = [];
  const candidates = getAgentUiCandidates(targetDocument);
  const duplicates = getDuplicateComponentNames(candidates);

  duplicates.forEach((component) => {
    warnings.push(buildDuplicateWarning(component));
  });

  const components = candidates
    .filter(({ component }) => !duplicates.has(component))
    .map(({ component, element }) =>
      parseAgentUiRegistration(component, element),
    )
    .flatMap((registration) => {
      if (registration.issues.length) {
        warnings.push(...registration.issues);
        return [];
      }

      if (
        !isElementVisible(registration.element) ||
        isElementDisabled(registration.element)
      ) {
        return [];
      }

      return [
        {
          component: registration.component,
          tagName: registration.tagName,
          actions: registration.actions,
        },
      ];
    });

  return {
    components,
    warnings,
  };
}

function invokeAgentUiAction(
  args: AgentUiActionArgs,
  targetDocument: Document = document,
): Promise<AgentUiActionResult> {
  const component = args.component?.trim();

  if (!component) {
    return Promise.resolve(
      createInvalidInput("interact_agent_ui requires a component name."),
    );
  }

  const action = args.action?.trim();
  if (!action || !isAgentUiActionName(action)) {
    return Promise.resolve(
      createInvalidAction(
        "interact_agent_ui action must be one of: click, full_write, key.",
      ),
    );
  }

  const candidates = getAgentUiCandidates(targetDocument);
  const duplicates = getDuplicateComponentNames(candidates);

  if (duplicates.has(component)) {
    return Promise.resolve({
      ok: false,
      code: "ambiguous",
      message: `Component '${component}' is registered multiple times.`,
    });
  }

  const candidate = candidates.find((entry) => entry.component === component);
  if (!candidate) {
    return Promise.resolve({
      ok: false,
      code: "not_found",
      message: `Component '${component}' was not found.`,
    });
  }

  if (!isElementVisible(candidate.element)) {
    return Promise.resolve({
      ok: false,
      code: "not_visible",
      message: `Component '${component}' is not currently visible.`,
    });
  }

  if (isElementDisabled(candidate.element)) {
    return Promise.resolve({
      ok: false,
      code: "disabled",
      message: `Component '${component}' is currently disabled.`,
    });
  }

  const registration = parseAgentUiRegistration(component, candidate.element);
  if (registration.issues.length) {
    return Promise.resolve(createInvalidAction(registration.issues[0]));
  }

  const declaredAction = registration.actions.find(
    (descriptor) => descriptor.name === action,
  );

  if (!declaredAction) {
    return Promise.resolve(
      createInvalidAction(
        `Component '${component}' does not support action '${action}'.`,
      ),
    );
  }

  if (action === "click") {
    focusElement(candidate.element);
    candidate.element.click();
    return Promise.resolve({
      ok: true,
      component,
      action,
      summary: `Clicked '${component}'.`,
    });
  }

  if (action === "full_write") {
    if (typeof args.text !== "string") {
      return Promise.resolve(
        createInvalidInput(
          "interact_agent_ui full_write requires a text string.",
        ),
      );
    }

    const didWrite = writeElementText(candidate.element, args.text);
    if (!didWrite) {
      return Promise.resolve({
        ok: false,
        code: "unsupported_element",
        message: `Component '${component}' does not support full_write.`,
      });
    }

    return Promise.resolve({
      ok: true,
      component,
      action,
      summary: `Replaced the content of '${component}'.`,
    });
  }

  if (typeof args.key !== "string" || !args.key) {
    return Promise.resolve(
      createInvalidInput("interact_agent_ui key requires a key string."),
    );
  }

  if (!registration.allowedKeys.includes(args.key)) {
    return Promise.resolve(
      createInvalidInput(
        `Component '${component}' only allows keys: ${registration.allowedKeys.join(", ")}.`,
      ),
    );
  }

  const keyTarget = getKeyTarget(candidate.element);
  keyTarget.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: args.key,
      bubbles: true,
      cancelable: true,
    }),
  );
  keyTarget.dispatchEvent(
    new KeyboardEvent("keyup", {
      key: args.key,
      bubbles: true,
      cancelable: true,
    }),
  );

  return Promise.resolve({
    ok: true,
    component,
    action,
    summary: `Sent key '${args.key}' to '${component}'.`,
  });
}

export function listAgentUi(
  targetDocument: Document = document,
): AgentUiScanResult {
  return scanAgentUi(targetDocument);
}

/**
 * Compare two AgentUiScanResult snapshots and return which components were
 * added or removed. Returns null when nothing changed.
 */
export function computeAgentUiDiff(
  before: AgentUiScanResult,
  after: AgentUiScanResult,
): AgentUiDiff | null {
  const beforeNames = new Set(before.components.map((c) => c.component));
  const afterNames = new Set(after.components.map((c) => c.component));

  const removedComponents = before.components.filter(
    (c) => !afterNames.has(c.component),
  );
  const addedComponents = after.components.filter(
    (c) => !beforeNames.has(c.component),
  );

  if (addedComponents.length === 0 && removedComponents.length === 0) {
    return null;
  }

  return { addedComponents, removedComponents };
}

/**
 * Wait for the next animation frame so DOM changes triggered by a click /
 * key event have time to settle before we re-scan.
 */
function waitForAnimationFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

export async function interactAgentUi(
  args: AgentUiActionArgs,
  targetDocument: Document = document,
): Promise<AgentUiActionResult> {
  const before = scanAgentUi(targetDocument);
  const result = await invokeAgentUiAction(args, targetDocument);

  if (!result.ok) {
    // Interaction failed — no point diffing.
    return result;
  }

  // Wait one frame so React / other frameworks can flush DOM updates.
  await waitForAnimationFrame();

  const after = scanAgentUi(targetDocument);
  const uiDiff = computeAgentUiDiff(before, after);

  return uiDiff ? { ...result, uiDiff } : result;
}
