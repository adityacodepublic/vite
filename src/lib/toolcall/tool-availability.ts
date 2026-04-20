import { create } from "zustand";

const TOOL_AVAILABILITY_STORAGE_KEY = "chat-tool-availability-v1";

type PersistedToolAvailability = {
  version: 1;
  bankingEnabled: boolean;
};

export type ToolAvailabilityState = {
  bankingEnabled: boolean;
};

type ToolAvailabilityStore = ToolAvailabilityState & {
  isApplyingBankingToggle: boolean;
  setBankingEnabled: (bankingEnabled: boolean) => void;
  setApplyingBankingToggle: (isApplying: boolean) => void;
};

const defaultState: ToolAvailabilityState = {
  bankingEnabled: false,
};

const isBrowser = () => typeof window !== "undefined";

export function loadToolAvailability(): ToolAvailabilityState {
  if (!isBrowser()) {
    return defaultState;
  }

  try {
    const raw = window.localStorage.getItem(TOOL_AVAILABILITY_STORAGE_KEY);
    if (!raw) {
      return defaultState;
    }

    const parsed = JSON.parse(raw) as PersistedToolAvailability;
    if (parsed.version !== 1 || typeof parsed.bankingEnabled !== "boolean") {
      return defaultState;
    }

    return {
      bankingEnabled: parsed.bankingEnabled,
    };
  } catch {
    return defaultState;
  }
}

export function persistToolAvailability(state: ToolAvailabilityState) {
  if (!isBrowser()) {
    return;
  }

  const payload: PersistedToolAvailability = {
    version: 1,
    bankingEnabled: state.bankingEnabled,
  };

  window.localStorage.setItem(
    TOOL_AVAILABILITY_STORAGE_KEY,
    JSON.stringify(payload),
  );
}

const initialState = loadToolAvailability();

export const useToolAvailabilityStore = create<ToolAvailabilityStore>((set) => ({
  ...initialState,
  isApplyingBankingToggle: false,
  setBankingEnabled: (bankingEnabled) => {
    persistToolAvailability({ bankingEnabled });
    set({ bankingEnabled });
  },
  setApplyingBankingToggle: (isApplyingBankingToggle) =>
    set({ isApplyingBankingToggle }),
}));
