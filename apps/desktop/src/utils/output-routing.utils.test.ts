import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppTarget } from "@voquill/types";
import type { AppState } from "../state/app.state";
import { INITIAL_APP_STATE } from "../state/app.state";
import { routeTranscriptOutput } from "./output-routing.utils";

const { storeState, invokeMock, isMacOSMock } = vi.hoisted(() => ({
  storeState: {
    appState: undefined as AppState | undefined,
  },
  invokeMock: vi.fn(),
  isMacOSMock: vi.fn(),
}));

const getTestAppState = (): AppState => {
  if (!storeState.appState) {
    throw new Error("Test app state not initialized");
  }

  return storeState.appState;
};

vi.mock("@tauri-apps/api/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tauri-apps/api/core")>();

  return {
    ...actual,
    invoke: invokeMock,
  };
});

vi.mock("../store", () => ({
  getAppState: () => getTestAppState(),
}));

vi.mock("./env.utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./env.utils")>();

  return {
    ...actual,
    isMacOS: isMacOSMock,
  };
});

vi.mock("../i18n/intl", () => ({
  getIntl: () => ({
    formatMessage: ({ defaultMessage }: { defaultMessage: string }) =>
      defaultMessage,
  }),
}));

vi.mock("./log.utils", () => ({
  getLogger: () => ({
    info: vi.fn(),
  }),
}));

vi.mock("./overlay.utils", () => ({
  sendPillFlashMessage: vi.fn(),
}));

vi.mock("./string.utils", () => ({
  sanitizeIndentation: (text: string) => text,
}));

vi.mock("./user.utils", () => ({
  getMyUserPreferences: (state: AppState) => state.userPrefs,
}));

const makeAppTarget = (
  overrides: Partial<AppTarget> & Pick<AppTarget, "id" | "name">,
): AppTarget => ({
  id: overrides.id,
  name: overrides.name,
  createdAt: overrides.createdAt ?? "2026-04-24T00:00:00.000Z",
  toneId: overrides.toneId ?? null,
  iconPath: overrides.iconPath ?? null,
  pasteKeybind: overrides.pasteKeybind ?? null,
});

describe("routeTranscriptOutput", () => {
  beforeEach(() => {
    storeState.appState = structuredClone(INITIAL_APP_STATE);
    storeState.appState.userPrefs = {
      remoteOutputEnabled: false,
      remoteTargetDeviceId: null,
      pasteKeybind: null,
    } as AppState["userPrefs"];

    invokeMock.mockReset();
    invokeMock.mockResolvedValue("pasted");
    isMacOSMock.mockReset();
    isMacOSMock.mockReturnValue(false);
  });

  it("uses terminal paste binding for WezTerm on macOS when no explicit binding is configured", async () => {
    isMacOSMock.mockReturnValue(true);
    getTestAppState().appTargetById.wezterm = makeAppTarget({
      id: "wezterm",
      name: "WezTerm",
    });

    await routeTranscriptOutput({
      text: "echo hi",
      mode: "dictation",
      currentAppId: "wezterm",
    });

    expect(invokeMock).toHaveBeenNthCalledWith(1, "paste", {
      text: "echo hi",
      keybind: "ctrl+shift+v",
    });
  });

  it("keeps an explicit app paste binding instead of overriding it with terminal defaults", async () => {
    isMacOSMock.mockReturnValue(true);
    getTestAppState().appTargetById.wezterm = makeAppTarget({
      id: "wezterm",
      name: "WezTerm",
      pasteKeybind: "ctrl+v",
    });

    await routeTranscriptOutput({
      text: "echo hi",
      mode: "dictation",
      currentAppId: "wezterm",
    });

    expect(invokeMock).toHaveBeenNthCalledWith(1, "paste", {
      text: "echo hi",
      keybind: "ctrl+v",
    });
  });

  it("infers the terminal paste binding from the current app id even before the app target is cached", async () => {
    isMacOSMock.mockReturnValue(true);

    await routeTranscriptOutput({
      text: "echo hi",
      mode: "dictation",
      currentAppId: "wezterm",
    });

    expect(invokeMock).toHaveBeenNthCalledWith(1, "paste", {
      text: "echo hi",
      keybind: "ctrl+shift+v",
    });
  });
});
