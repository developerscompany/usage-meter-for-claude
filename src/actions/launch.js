// Launch key: one press opens a terminal running Claude Code in the folder of your choice, with the
// default Claude account or another account's profile.
import path from "node:path";
import { launchCommand } from "../launch.js";
import { accountEmail } from "../login.js";
import { COLORS, esc, header, svg, text, textWidth } from "../render/svg.js";
import { PREFIX, launchProfiles, pick, tildify } from "./common.js";

const CLAUDE_ORANGE = "#d97757";

const folderName = (folder) => (folder === "~" || !folder ? "~" : path.basename(folder.replace(/[\\/]+$/, "")) || folder);

/** A gray line that gets smaller when long, and is cut with an ellipsis when even 10 px is too wide. */
function fitted(y, content) {
	let s = content;
	if (textWidth(s, 10) > 132) {
		while (s.length > 1 && textWidth(`${s}…`, 10) > 132) s = s.slice(0, -1);
		s = `${s}…`;
	}
	return text(72, y, Math.min(13, Math.floor(132 / textWidth(s, 1))), COLORS.gray, esc(s));
}

// the terminal a new key opens: Terminal on a Mac, Command Prompt on Windows
const DEFAULT_TERMINAL = process.platform === "win32" ? "cmd" : "terminal";

export const launchAction = {
	id: "launch",
	uuid: `${PREFIX}.launch`,
	styles: [{ id: "prompt", label: "Prompt" }],

	normalize(raw) {
		const s = { folder: "~", command: "claude", terminal: DEFAULT_TERMINAL, account: "", tag: "", ...(raw ?? {}) };
		s.folder = typeof s.folder === "string" && s.folder.trim() ? s.folder.trim() : "~";
		s.command = typeof s.command === "string" && s.command.trim() ? s.command.trim() : "claude";
		s.terminal = pick(s.terminal, ["terminal", "iterm", "cmd", "wt"], DEFAULT_TERMINAL);
		s.account = typeof s.account === "string" ? s.account.trim() : "";
		s.tag = typeof s.tag === "string" ? s.tag.trim().slice(0, 3) : "";
		return s;
	},

	needs: () => ({}),
	refreshSeconds: () => 3600,

	render(ctx) {
		const s = ctx.settings;
		return svg([
			header("CLAUDE CODE", { tag: s.tag }),
			text(72, 92, 46, CLAUDE_ORANGE, "&gt;_"),
			fitted(116, s.command),
			fitted(136, folderName(s.folder)),
		]);
	},

	press(ctx) {
		const exec = launchCommand(ctx.settings);
		return exec ? { exec } : "refresh";
	},

	info(ctx) {
		const exec = launchCommand(ctx.settings);
		const where = { terminal: "Terminal", iterm: "iTerm", cmd: "Command Prompt", wt: "Windows Terminal" }[ctx.settings.terminal];
		const email = accountEmail(exec?.profile ?? "");
		return {
			info: [
				["Runs", exec ? `${exec.command}` : "not on this system"],
				["In", exec ? tildify(exec.folder) : "—"],
				["Account", `${exec?.profile ? tildify(exec.profile) : "Default (~/.claude)"}${email ? ` · ${email}` : ""}`],
				["Opens", where],
			],
			accounts: launchProfiles(),
		};
	},
};
