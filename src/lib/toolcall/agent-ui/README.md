# Agent UI Tools

These tools let the model interact with specific DOM elements only when you opt in with data attributes.

## Register A Component

Add the attributes to the actual interactive element:

- `data-agent-component="uniqueName"`: required unique id.
- `data-agent-actions="click,full_write,key"`: required allowed actions.
- `data-agent-desc-click="..."`: required for each declared action.
- `data-agent-desc-full-write="..."`: required when `full_write` is declared.
- `data-agent-desc-key="..."`: required when `key` is declared.
- `data-agent-key-allowed="Enter,Escape"`: required only for `key`.

`full_write` works on `<input>`, `<textarea>`, and `contenteditable` elements.

## How It Works

1. `list_agent_ui` scans `[data-agent-component]`.
2. It keeps only visible, enabled, uniquely named elements with valid metadata.
3. Invalid or duplicate registrations are skipped and returned as warnings.
4. `interact_agent_ui` resolves the component again, validates the action, then clicks, writes text, or dispatches an allowed key.
