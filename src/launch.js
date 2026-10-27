// Opens a terminal window that runs a command (claude by default) in a folder, optionally with another
// account's Claude Code profile (CLAUDE_CONFIG_DIR).
// macOS: Terminal or iTerm through AppleScript; folder and profile go in as arguments and are quoted there.
// Windows: Command Prompt or Windows Terminal, the profile through the environment. CLAUDE_LAUNCHER replaces
// all of it (used by the tests).
import os from "node:os";
import { accountDir } from "./login.js";
import { expandHome } from "./usage-index.js";

/** The line Terminal runs: cd to the folder, set the profile when there is one, then the command. */
const shellLine = (profile) =>
	profile
		? `"cd " & quoted form of (item 1 of argv) & " && export CLAUDE_CONFIG_DIR=" & quoted form of (item 3 of argv) & " && " & (item 2 of argv)`
		: `"cd " & quoted form of (item 1 of argv) & " && " & (item 2 of argv)`;
const TERMINAL = (line) => ['tell application "Terminal"', "activate", `do script (${line})`, "end tell"];
const ITERM = (line) => ['tell application "iTerm"', "activate", "set w to (create window with default profile)", `tell current session of w to write text (${line})`, "end tell"];

/**
 * The program to start for a launch key, or null where there is no terminal to open.
 * @param {{ folder: string, command: string, terminal: string, account?: string }} s
 * @returns {{ file: string, args: string[], folder: string, command: string, profile: string, env: object | null } | null}
 */
export function launchCommand(s, { platform = process.platform, env = process.env, home = os.homedir() } = {}) {
	const folder = expandHome(s.folder || "~", home);
	const command = s.command || "claude";
	// the default profile needs no variable: setting it would make Claude Code look for another login
	const dir = s.account ? accountDir(s.account, home) : "";
	const profile = dir && dir !== accountDir("", home) ? dir : "";
	const run = (file, args) => ({ file, args, folder, command, profile, env: profile ? { ...env, CLAUDE_CONFIG_DIR: profile } : null });
	if (env.CLAUDE_LAUNCHER) return run(env.CLAUDE_LAUNCHER, [folder, command]);
	if (platform === "darwin") {
		const line = shellLine(profile);
		const lines = ["on run argv", ...(s.terminal === "iterm" ? ITERM(line) : TERMINAL(line)), "end run"];
		return run("/usr/bin/osascript", [...lines.flatMap((l) => ["-e", l]), folder, command, ...(profile ? [profile] : [])]);
	}
	if (platform === "win32") {
		if (s.terminal === "wt") return run("wt.exe", ["-d", folder, "cmd.exe", "/k", command]);
		return run("cmd.exe", ["/c", "start", "", "/d", folder, "cmd.exe", "/k", command]);
	}
	return null;
}
