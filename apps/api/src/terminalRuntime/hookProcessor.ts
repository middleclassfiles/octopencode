import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { logVerbose } from "../logging";
import { storeOpencodeTranscriptTurns } from "./conversations";
import { buildOpencodePluginSource } from "./opencodePlugin";
import { exportOpencodeSession } from "./opencodeTranscript";
import { broadcastMessage } from "./protocol";
import type { PersistedTerminal, TerminalSession } from "./types";

const MAX_AUTO_NAME_LENGTH = 50;

const deriveTerminalNameFromPrompt = (prompt: string): string => {
  const normalized = prompt.replace(/\s+/g, " ").trim();
  if (normalized.length <= MAX_AUTO_NAME_LENGTH) {
    return normalized;
  }

  // Truncate at the last space before the limit to avoid cutting mid-word.
  const truncated = normalized.slice(0, MAX_AUTO_NAME_LENGTH);
  const lastSpace = truncated.lastIndexOf(" ");
  return lastSpace > 0 ? `${truncated.slice(0, lastSpace)}…` : `${truncated}…`;
};

export const createHookProcessor = (deps: {
  terminals: Map<string, PersistedTerminal>;
  sessions: Map<string, TerminalSession>;
  transcriptDirectoryPath: string;
  getApiBaseUrl: () => string;
  persistRegistry: () => void;
  deliverChannelMessages: (terminalId: string) => number;
  releaseSessionKeepAlive: (terminalId: string) => boolean;
  onStateChange?: (
    terminalId: string,
    state: TerminalSession["agentState"],
    toolName?: string,
  ) => void;
}) => {
  const {
    terminals,
    sessions,
    transcriptDirectoryPath,
    getApiBaseUrl,
    persistRegistry,
    deliverChannelMessages,
    releaseSessionKeepAlive,
    onStateChange,
  } = deps;

  const installHooksInDirectory = (targetCwd: string) => {
    const pluginDirectory = join(targetCwd, ".opencode", "plugin");
    const pluginPath = join(pluginDirectory, "hydra-events.js");
    const apiBaseUrl = getApiBaseUrl();

    try {
      mkdirSync(pluginDirectory, { recursive: true });
      writeFileSync(pluginPath, buildOpencodePluginSource(apiBaseUrl), "utf8");
    } catch {
      // Best-effort: the bridge should not block terminal creation.
    }
  };

  const setAgentState = (
    session: TerminalSession,
    sessionId: string,
    state: TerminalSession["agentState"],
    toolName?: string,
  ) => {
    session.agentState = state;
    session.stateTracker.forceState(state);
    onStateChange?.(sessionId, state, toolName);
    broadcastMessage(session, {
      type: "state",
      state,
      ...(toolName ? { toolName } : {}),
    });
  };

  const resolveSessionFromPayload = (
    payload: Record<string, unknown>,
    hydraSessionId?: string,
  ): { terminalId: string; session: TerminalSession } | null => {
    if (hydraSessionId && sessions.has(hydraSessionId)) {
      return {
        terminalId: hydraSessionId,
        session: sessions.get(hydraSessionId) as TerminalSession,
      };
    }

    // opencode sessions report their own session id; bind it to a terminal
    // when the hydra session param was not provided.
    const opencodeSessionId = typeof payload.session_id === "string" ? payload.session_id : null;
    if (!opencodeSessionId) {
      return null;
    }

    for (const [terminalId, session] of sessions) {
      if (session.opencodeSessionId === opencodeSessionId) {
        return { terminalId, session };
      }
    }

    return null;
  };

  const handleHook = (
    hookName: string,
    payload: unknown,
    hydraSessionId?: string,
  ): { ok: boolean } => {
    logVerbose(`[Hook] Received hook: ${hookName} hydraSession=${hydraSessionId ?? "(none)"}`);

    if (!payload || typeof payload !== "object") {
      return { ok: true };
    }

    const hookPayloadRecord = payload as Record<string, unknown>;

    if (hookName === "session-start") {
      if (!hydraSessionId) {
        return { ok: true };
      }
      const session = sessions.get(hydraSessionId);
      if (!session) {
        return { ok: true };
      }

      const opencodeSessionId =
        typeof hookPayloadRecord.session_id === "string" ? hookPayloadRecord.session_id : null;
      if (opencodeSessionId) {
        session.opencodeSessionId = opencodeSessionId;
        logVerbose(
          `[Hook] Bound opencode session ${opencodeSessionId} → terminal ${hydraSessionId}`,
        );
      }
      return { ok: true };
    }

    if (hookName === "notification") {
      if (!hydraSessionId) {
        return { ok: true };
      }
      const session = sessions.get(hydraSessionId);
      if (!session) {
        logVerbose(`[Hook] notification: no session for ${hydraSessionId}, skipping.`);
        return { ok: true };
      }

      const notificationType =
        typeof hookPayloadRecord.notification_type === "string"
          ? hookPayloadRecord.notification_type
          : null;

      logVerbose(`[Hook] notification: type=${notificationType} session=${hydraSessionId}`);

      if (notificationType === "permission_prompt") {
        setAgentState(session, hydraSessionId, "waiting_for_permission", session.lastToolName);
      } else if (notificationType === "idle_prompt") {
        setAgentState(session, hydraSessionId, "idle");

        // Deliver any queued channel messages now that the agent is idle.
        deliverChannelMessages(hydraSessionId);
      }

      return { ok: true };
    }

    if (hookName === "pre-tool-use") {
      if (!hydraSessionId) {
        return { ok: true };
      }
      const session = sessions.get(hydraSessionId);
      if (!session) {
        return { ok: true };
      }

      const toolName =
        typeof hookPayloadRecord.tool_name === "string" ? hookPayloadRecord.tool_name : null;

      logVerbose(`[Hook] pre-tool-use: tool=${toolName} session=${hydraSessionId}`);

      if (toolName) {
        session.lastToolName = toolName;
      }

      if (toolName === "question") {
        setAgentState(session, hydraSessionId, "waiting_for_user");
      }

      return { ok: true };
    }

    if (hookName === "user-prompt-submit") {
      if (!hydraSessionId) {
        return { ok: true };
      }

      const terminal = terminals.get(hydraSessionId);
      if (!terminal) {
        return { ok: true };
      }

      // Update last-active timestamp (determines active/inactive on the canvas).
      terminal.lastActiveAt = new Date().toISOString();

      // The user submitted a prompt, so the agent is about to start processing.
      // Transition state out of waiting/idle to processing immediately.
      const activitySession = sessions.get(terminal.terminalId);
      if (activitySession) {
        activitySession.agentState = "processing";
        activitySession.lastToolName = undefined;
        activitySession.stateTracker.forceState("processing");
        onStateChange?.(terminal.terminalId, "processing");
        broadcastMessage(activitySession, { type: "state", state: "processing" });
        broadcastMessage(activitySession, { type: "activity" });
      }

      // Auto-name the terminal from the first prompt when it still has its default name.
      if (terminal.nameOrigin === "generated") {
        const prompt =
          typeof hookPayloadRecord.prompt === "string" ? hookPayloadRecord.prompt.trim() : "";
        const renameContext = terminal.autoRenamePromptContext?.trim() || prompt;
        if (renameContext.length > 0) {
          const derived = deriveTerminalNameFromPrompt(renameContext);
          terminal.tentacleName = derived;
          terminal.nameOrigin = "prompt";
          terminal.autoRenamePromptContext = undefined;
          logVerbose(`[Hook] Auto-named terminal ${terminal.terminalId} → "${derived}"`);

          const session = sessions.get(terminal.terminalId);
          if (session) {
            broadcastMessage(session, { type: "rename", tentacleName: derived });
          }
        }
      }

      persistRegistry();
      return { ok: true };
    }

    if (hookName !== "stop") {
      return { ok: true };
    }

    const resolved = resolveSessionFromPayload(hookPayloadRecord, hydraSessionId);
    if (!resolved) {
      logVerbose("[Hook] stop: no matching session, skipping.");
      return { ok: true };
    }
    const { terminalId, session } = resolved;
    const opencodeSessionId =
      session.opencodeSessionId ??
      (typeof hookPayloadRecord.session_id === "string" ? hookPayloadRecord.session_id : null);

    logVerbose(
      `[Hook] Stop hook: terminal=${terminalId} opencodeSession=${opencodeSessionId ?? "(none)"}`,
    );

    // Pull the conversation from opencode's own session store.
    if (opencodeSessionId && !session.hasTranscriptEnded) {
      const parsed = exportOpencodeSession(opencodeSessionId);
      if (parsed && parsed.turns.length > 0) {
        storeOpencodeTranscriptTurns(transcriptDirectoryPath, terminalId, parsed.turns);
        logVerbose(`[Hook] Stored ${parsed.turns.length} turns for session ${terminalId}.`);
      } else {
        logVerbose("[Hook] opencode export returned no turns; skipping store.");
      }
      session.hasTranscriptEnded = true;
    }

    // Deliver any queued channel messages now that the agent is idle.
    const deliveredMessageCount = deliverChannelMessages(terminalId);
    if (deliveredMessageCount === 0) {
      releaseSessionKeepAlive(terminalId);
    }

    return { ok: true };
  };

  return { handleHook, installHooksInDirectory };
};
