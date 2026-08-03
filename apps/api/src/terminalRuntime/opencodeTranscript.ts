import { execFileSync } from "node:child_process";

import type { ConversationTurn } from "./conversations";

type OpencodePart = {
  type?: string;
  text?: string;
  tool?: string;
  state?: {
    status?: string;
    input?: unknown;
    output?: unknown;
  };
};

type OpencodeMessage = {
  info?: {
    role?: string;
    time?: { created?: number };
    id?: string;
  };
  parts?: OpencodePart[];
};

type OpencodeExportPayload = {
  info?: Record<string, unknown>;
  messages?: OpencodeMessage[];
};

export type ParsedOpencodeSession = {
  sessionId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  turns: ConversationTurn[];
};

const toIso = (epochMillis: unknown): string => {
  const ms = typeof epochMillis === "number" ? epochMillis : Number(epochMillis ?? 0);
  if (!Number.isFinite(ms) || ms <= 0) {
    return new Date().toISOString();
  }
  return new Date(ms).toISOString();
};

const extractToolSummary = (part: OpencodePart): string | null => {
  const toolName = typeof part.tool === "string" ? part.tool : "";
  if (!toolName) {
    return null;
  }

  const input =
    part.state && typeof part.state.input === "object" && part.state.input !== null
      ? (part.state.input as Record<string, unknown>)
      : {};
  let detail = "";
  if (typeof input.command === "string") {
    detail = `: \`${input.command.length > 80 ? `${input.command.slice(0, 77)}...` : input.command}\``;
  } else if (typeof input.filePath === "string") {
    detail = `: ${input.filePath}`;
  } else if (typeof input.file_path === "string") {
    detail = `: ${input.file_path}`;
  } else if (typeof input.pattern === "string") {
    detail = `: ${input.pattern}`;
  } else if (typeof input.query === "string") {
    detail = `: ${input.query}`;
  } else if (typeof input.url === "string") {
    detail = `: ${input.url}`;
  } else if (typeof input.description === "string") {
    detail = `: ${input.description}`;
  } else if (typeof input.message === "string") {
    detail = `: ${input.message.length > 80 ? `${input.message.slice(0, 77)}...` : input.message}`;
  }

  return `[${toolName}${detail}]`;
};

const extractMessageText = (message: OpencodeMessage): string => {
  const lines: string[] = [];
  for (const part of message.parts ?? []) {
    if (part.type === "text" && typeof part.text === "string" && part.text.trim().length > 0) {
      lines.push(part.text.trim());
    } else if (part.type === "tool") {
      const summary = extractToolSummary(part);
      if (summary) {
        lines.push(summary);
      }
    } else if (
      part.type === "reasoning" &&
      typeof part.text === "string" &&
      part.text.trim().length > 0
    ) {
      lines.push(`(reasoning) ${part.text.trim()}`);
    }
  }
  return lines.join("\n").trim();
};

const isCommandWrapped = (text: string): boolean =>
  text.includes("<command-name>") && text.includes("</command-name>");

export const parseOpencodeExport = (payload: unknown): ParsedOpencodeSession | null => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const record = payload as OpencodeExportPayload;
  if (!Array.isArray(record.messages) || record.messages.length === 0) {
    return null;
  }

  const infoRecord =
    record.info && typeof record.info === "object" ? (record.info as Record<string, unknown>) : {};
  const timeRecord =
    infoRecord.time && typeof infoRecord.time === "object"
      ? (infoRecord.time as Record<string, unknown>)
      : {};
  const sessionId = typeof infoRecord.id === "string" ? infoRecord.id : "unknown";

  const turns: ConversationTurn[] = [];
  let turnCounter = 0;

  // Accumulate consecutive assistant messages into a single turn.
  let pendingAssistantParts: string[] = [];
  let pendingAssistantStartedAt: string | null = null;
  let pendingAssistantEndedAt: string | null = null;

  const flushAssistantTurn = () => {
    if (pendingAssistantParts.length === 0) {
      return;
    }

    const content = pendingAssistantParts.join("\n").trim();
    if (content.length > 0) {
      turnCounter += 1;
      turns.push({
        turnId: `turn-${turnCounter}`,
        role: "assistant",
        content,
        startedAt: pendingAssistantStartedAt ?? new Date().toISOString(),
        endedAt: pendingAssistantEndedAt ?? new Date().toISOString(),
      });
    }

    pendingAssistantParts = [];
    pendingAssistantStartedAt = null;
    pendingAssistantEndedAt = null;
  };

  for (const message of record.messages) {
    const role = message.info?.role;
    const timestamp = toIso(message.info?.time?.created);

    if (role === "user") {
      flushAssistantTurn();

      const text = extractMessageText(message);
      if (text.length === 0 || isCommandWrapped(text)) {
        continue;
      }

      turnCounter += 1;
      turns.push({
        turnId: `turn-${turnCounter}`,
        role: "user",
        content: text,
        startedAt: timestamp,
        endedAt: timestamp,
      });
      continue;
    }

    if (role === "assistant") {
      const text = extractMessageText(message);
      if (text.length > 0) {
        if (!pendingAssistantStartedAt) {
          pendingAssistantStartedAt = timestamp;
        }
        pendingAssistantEndedAt = timestamp;
        pendingAssistantParts.push(text);
      }
    }
  }

  flushAssistantTurn();

  if (turns.length === 0) {
    return null;
  }

  return {
    sessionId,
    title: typeof infoRecord.title === "string" ? infoRecord.title : "Untitled session",
    createdAt: toIso(timeRecord.created),
    updatedAt: toIso(timeRecord.updated),
    turns,
  };
};

export const exportOpencodeSession = (sessionId: string): ParsedOpencodeSession | null => {
  try {
    const output = execFileSync("opencode", ["export", "--sanitize", sessionId], {
      encoding: "utf8",
      stdio: "pipe",
      timeout: 30_000,
      windowsHide: true,
    });
    const parsed = JSON.parse(output) as unknown;
    return parseOpencodeExport(parsed);
  } catch {
    return null;
  }
};
