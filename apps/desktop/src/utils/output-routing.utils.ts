import { invoke } from "@tauri-apps/api/core";
import type {
  RouteTranscriptOutputArgs,
  RouteTranscriptOutputResult,
} from "@voquill/types";
import { getIntl } from "../i18n/intl";
import { getAppState } from "../store";
import { isMacOS } from "./env.utils";
import { getLogger } from "./log.utils";
import { sendPillFlashMessage } from "./overlay.utils";
import { sanitizeIndentation } from "./string.utils";
import { getMyUserPreferences } from "./user.utils";

type PasteOutcome = "pasted" | "copied_to_clipboard";
const MACOS_TERMINAL_PASTE_KEYBIND = "ctrl+shift+v";
const MACOS_TERMINAL_APP_HINTS = ["wezterm", "ghostty"];

export const routeTranscriptOutput = async (
  args: RouteTranscriptOutputArgs,
): Promise<RouteTranscriptOutputResult> => {
  const state = getAppState();
  const prefs = getMyUserPreferences(state);
  const currentApp = args.currentAppId
    ? (state.appTargetById[args.currentAppId] ?? null)
    : null;

  if (prefs?.remoteOutputEnabled && prefs.remoteTargetDeviceId) {
    if (!args.text.trim()) {
      return {
        delivered: false,
        remote: true,
      };
    }

    await invoke<void>("remote_sender_deliver_final_text", {
      args: {
        targetDeviceId: prefs.remoteTargetDeviceId,
        text: args.text,
        mode: args.mode,
      },
    });

    return {
      delivered: true,
      remote: true,
    };
  }

  const configuredPasteKeybind =
    state.supportsPasteKeybinds === "global"
      ? (prefs?.pasteKeybind ?? null)
      : (currentApp?.pasteKeybind ?? prefs?.pasteKeybind ?? null);
  const pasteKeybind =
    configuredPasteKeybind ??
    inferMacOSTerminalPasteKeybind(args.currentAppId, currentApp?.name);

  await insertLocalTranscriptOutput(args.text, pasteKeybind);

  return {
    delivered: true,
    remote: false,
  };
};

export const insertLocalTranscriptOutput = async (
  text: string,
  keybind: string | null,
): Promise<void> => {
  const sanitized = sanitizeIndentation(text);

  const outcome = await invoke<PasteOutcome>("paste", {
    text: sanitized,
    keybind,
  });

  if (outcome === "copied_to_clipboard") {
    getLogger().info(
      "Focused element was not editable, transcription copied to clipboard",
    );
    sendPillFlashMessage(
      getIntl().formatMessage({
        defaultMessage: "Transcript copied to clipboard",
      }),
    );
  }
};

const inferMacOSTerminalPasteKeybind = (
  appId: string | null | undefined,
  appName: string | null | undefined,
): string | null => {
  if (!isMacOS()) {
    return null;
  }

  const haystacks = [appId, appName].filter(
    (value): value is string => Boolean(value?.trim()),
  );
  const matchesKnownTerminal = haystacks.some((value) => {
    const normalized = value.trim().toLowerCase();
    return MACOS_TERMINAL_APP_HINTS.some((hint) => normalized.includes(hint));
  });

  return matchesKnownTerminal ? MACOS_TERMINAL_PASTE_KEYBIND : null;
};
