// Builds the self-contained opencode plugin that bridges a managed terminal's
// opencode process back to the Hydra API. opencode auto-discovers every
// *.js file in `.opencode/plugin/`, so Hydra only needs to write this file.
//
// The plugin forwards lifecycle events as fire-and-forget POSTs and never
// blocks opencode, matching the best-effort nature of the plugin bridge.

export const buildOpencodePluginSource = (apiBaseUrl: string): string => {
  const apiOrigin = apiBaseUrl.replace(/\/+$/, "");
  const pluginName = "hydra-events";
  const envApiVar = "HYDRA_API_URL";
  const envSessionVar = "HYDRA_SESSION_ID";

  const header = `
/*
 * ${pluginName} — managed bridge installed by Hydra.
 *
 * This file is generated and owned by the Hydra API process. Do not edit it
 * by hand; it is rewritten every time Hydra installs its plugin bridge for a
 * workspace. Remove it only if you want to disable Hydra's event feed for
 * this project.
 *
 * It forwards opencode lifecycle events to the local Hydra API so the
 * dashboard can show agent state, transcripts, and channel messages without
 * parsing raw terminal output.
 */
export default async () => {
  const apiOrigin = process.env.${envApiVar} || ${JSON.stringify(apiOrigin)};
  const sessionID = process.env.${envSessionVar} || "";
  const post = (hookName, payload) => {
    try {
      const query = sessionID ? "?hydra_session=" + encodeURIComponent(sessionID) : "";
      fetch(apiOrigin + "/api/hooks/" + hookName + query, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload || {}),
      }).catch(() => {});
    } catch {}
  };

  const postPath = (path, payload) => {
    try {
      fetch(apiOrigin + path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload || {}),
      }).catch(() => {});
    } catch {}
  };

  const sendEvent = (event) => {
    if (!event || typeof event.type !== "string") return;
    const sessionId = event.sessionID || event.session_id || "";
    const hydraSession = sessionID || sessionId;
    if (event.type === "session.created") {
      post("session-start", { session_id: sessionId });
    } else if (event.type === "message.updated") {
      const props = event.properties || {};
      if (props.role === "user") {
        post("user-prompt-submit", { session_id: sessionId });
      }
    } else if (event.type === "permission.updated") {
      post("notification", {
        notification_type: "permission_prompt",
        session_id: sessionId,
      });
    } else if (event.type === "session.idle") {
      post("notification", {
        notification_type: "idle_prompt",
        session_id: sessionId,
      });
      post("stop", { session_id: sessionId, idle: true });
    } else if (event.type === "session.error") {
      post("notification", {
        notification_type: "idle_prompt",
        session_id: sessionId,
      });
      post("stop", { session_id: sessionId, idle: true, error: true });
    }
    void hydraSession;
  };

  const sendToolBefore = (input) => {
    if (!input || typeof input.tool !== "string") return;
    post("pre-tool-use", {
      tool_name: input.tool,
      session_id: input.sessionID || "",
      call_id: input.callID || "",
    });
  };

  const sendToolAfter = (input) => {
    if (!input || typeof input.tool !== "string") return;
    if (input.tool !== "edit" && input.tool !== "write") return;
    const args = input.args || input.input || {};
    postPath("/api/code-intel/events", {
      tool_name: input.tool,
      session_id: input.sessionID || "",
      tool_input: { file_path: args.filePath || args.file_path || "" },
    });
  };

  return {
    event: ({ event }) => {
      sendEvent(event);
    },
    "tool.execute.before": (input) => {
      sendToolBefore(input);
    },
    "tool.execute.after": (input) => {
      sendToolAfter(input);
    },
  };
};
`;

  return header.trimStart();
};
