// Builders for Claude Code transcript lines, shaped like real ~/.claude/projects/*.jsonl entries.
import crypto from "node:crypto";

const id = (prefix) => `${prefix}_${crypto.randomBytes(12).toString("hex")}`;

export function usage({ input = 0, output = 0, cacheWrite = 0, cacheRead = 0 } = {}) {
	return {
		input_tokens: input,
		cache_creation_input_tokens: cacheWrite,
		cache_read_input_tokens: cacheRead,
		output_tokens: output,
		service_tier: "standard",
		cache_creation: { ephemeral_1h_input_tokens: cacheWrite, ephemeral_5m_input_tokens: 0 },
	};
}

export const SESSION_ID = "11111111-1111-4111-8111-111111111111";

/** One API response, logged as one line per content block like Claude Code does. */
export function assistantLines({ at, tokens, blocks = ["thinking", "text", "tool_use"], messageId = id("msg"), requestId = id("req"), text = "ok", sessionId = SESSION_ID, model = "claude-opus-5-5", cwd = "/Users/nick/project" }) {
	return blocks.map((type) =>
		JSON.stringify({
			parentUuid: crypto.randomUUID(),
			isSidechain: false,
			userType: "external",
			cwd,
			sessionId,
			version: "2.1.42",
			gitBranch: "main",
			message: {
				id: messageId,
				type: "message",
				role: "assistant",
				model,
				content: [type === "tool_use" ? { type, id: id("toolu"), name: "Bash", input: { command: "ls" } } : { type, text }],
				stop_reason: null,
				stop_sequence: null,
				usage: usage(tokens),
			},
			requestId,
			type: "assistant",
			uuid: crypto.randomUUID(),
			timestamp: new Date(at).toISOString(),
		}),
	);
}

/** A sub-agent's tool result: carries a usage summary that must not be counted. */
export function taskResultLine({ at, tokens }) {
	return JSON.stringify({
		parentUuid: crypto.randomUUID(),
		type: "user",
		message: { role: "user", content: [{ type: "tool_result", tool_use_id: id("toolu"), content: "done" }] },
		toolUseResult: { status: "completed", totalTokens: 999, usage: usage(tokens) },
		uuid: crypto.randomUUID(),
		timestamp: new Date(at).toISOString(),
	});
}

export function userLine({ at, text = "hello" }) {
	return JSON.stringify({ type: "user", message: { role: "user", content: text }, uuid: crypto.randomUUID(), timestamp: new Date(at).toISOString() });
}
