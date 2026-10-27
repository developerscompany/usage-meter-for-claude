import assert from "node:assert/strict";
import { test } from "node:test";
import { cacheStats, streakStats } from "../src/actions/activity.js";
import { launchCommand } from "../src/launch.js";
import { addDays, dayKey, emptyTotals, startOfDay } from "../src/usage-index.js";

const now = new Date(2026, 9, 21, 16, 30);

/** The parts of UsageIndex these keys use, over [daysAgo, model, totals] entries. */
function fakeIndex(entries, windowDays = 40) {
	const days = new Map();
	for (const [back, model, t] of entries) {
		const key = dayKey(addDays(startOfDay(now), -back));
		if (!days.has(key)) days.set(key, new Map());
		days.get(key).set(model, { ...emptyTotals(), requests: 1, ...t });
	}
	const add = (into, t) => Object.keys(into).forEach((k) => (into[k] += t[k]));
	return {
		windowDays,
		day(key) {
			const total = emptyTotals();
			for (const t of days.get(key)?.values() ?? []) add(total, t);
			return total;
		},
		byModel(keys) {
			const out = new Map();
			for (const key of keys) for (const [model, t] of days.get(key) ?? []) add(out.get(model) ?? out.set(model, emptyTotals()).get(model), t);
			return out;
		},
	};
}

test("cache hits and what the cache reads saved at API prices", () => {
	const index = fakeIndex([
		[0, "claude-opus-5-5", { input: 500_000, cacheWrite: 1_000_000, cacheRead: 23_500_000 }],
		[1, "claude-sonnet-5-5", { cacheRead: 10_000_000 }],
	]);
	const days = [0, 1].map((back) => dayKey(addDays(startOfDay(now), -back)));
	const c = cacheStats(index, days);
	assert.equal(c.read, 33_500_000);
	assert.equal(c.prompt, 35_000_000);
	assert.ok(Math.abs(c.hit - 95.714) < 0.001);
	// Opus 5.5: $4 input, $0.20 cache read; Sonnet 5.5: $2 and $0.20
	assert.ok(Math.abs(c.saved - (23.5 * 3.8 + 10 * 1.8)) < 1e-9);
	assert.equal(cacheStats(fakeIndex([]), days).hit, null, "nothing to say without input");
});

test("streak: days in a row, today still open, best run, capped at the kept days", () => {
	const run = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => [from + i, "claude-opus-5-5", {}]);
	let s = streakStats(fakeIndex([...run(0, 11), [20, "claude-opus-5-5", {}]]), now);
	assert.deepEqual([s.current, s.best, s.todayActive, s.capped], [12, 12, true, false]);
	assert.equal(s.days.length, 35);
	assert.deepEqual(s.days.slice(-3), [1, 1, 1], "today last");

	s = streakStats(fakeIndex(run(1, 5)), now);
	assert.deepEqual([s.current, s.todayActive], [5, false], "yesterday's streak lives on until today ends");

	s = streakStats(fakeIndex([[9, "claude-opus-5-5", {}]]), now);
	assert.deepEqual([s.current, s.best], [0, 1]);

	s = streakStats(fakeIndex(run(0, 39)), now);
	assert.deepEqual([s.current, s.capped], [40, true], "may go back further than the index keeps");
});

test("launch command for Terminal, iTerm, Command Prompt and Windows Terminal", () => {
	const home = "/Users/nick";
	const mac = launchCommand({ folder: "~/my app", command: "claude --continue", terminal: "terminal" }, { platform: "darwin", env: {}, home });
	assert.equal(mac.file, "/usr/bin/osascript");
	assert.deepEqual(mac.args.slice(-2), ["/Users/nick/my app", "claude --continue"], "folder and command go in as arguments");
	assert.ok(mac.args.includes('tell application "Terminal"'));
	assert.ok(mac.args.some((a) => a.includes("quoted form of (item 1 of argv)")), "the folder is quoted by AppleScript");

	const iterm = launchCommand({ folder: "~", command: "claude", terminal: "iterm" }, { platform: "darwin", env: {}, home });
	assert.ok(iterm.args.includes('tell application "iTerm"'));
	assert.equal(iterm.args.at(-2), "/Users/nick");

	const win = launchCommand({ folder: "C:\\work", command: "claude", terminal: "cmd" }, { platform: "win32", env: {}, home: "C:\\Users\\nick" });
	assert.deepEqual([win.file, ...win.args], ["cmd.exe", "/c", "start", "", "/d", "C:\\work", "cmd.exe", "/k", "claude"]);
	const wt = launchCommand({ folder: "C:\\work", command: "claude", terminal: "wt" }, { platform: "win32", env: {}, home: "C:\\Users\\nick" });
	assert.deepEqual([wt.file, ...wt.args], ["wt.exe", "-d", "C:\\work", "cmd.exe", "/k", "claude"]);

	const custom = launchCommand({ folder: "~/x", command: "claude" }, { platform: "darwin", env: { CLAUDE_LAUNCHER: "/tmp/fake" }, home });
	assert.deepEqual([custom.file, ...custom.args], ["/tmp/fake", "/Users/nick/x", "claude"]);
	assert.equal(launchCommand({ folder: "~", command: "claude" }, { platform: "linux", env: {}, home }), null);
});

test("launch command with another Claude account's profile", () => {
	const home = "/Users/nick";
	const work = launchCommand({ folder: "~/app", command: "claude", terminal: "terminal", account: "~/.claude-work" }, { platform: "darwin", env: {}, home });
	assert.equal(work.profile, "/Users/nick/.claude-work");
	assert.deepEqual(work.args.slice(-3), ["/Users/nick/app", "claude", "/Users/nick/.claude-work"], "the profile goes in as an argument");
	assert.ok(work.args.some((a) => a.includes('" && export CLAUDE_CONFIG_DIR=" & quoted form of (item 3 of argv)')), "and AppleScript quotes it");
	const iterm = launchCommand({ folder: "~", command: "claude", terminal: "iterm", account: "~/.claude-work" }, { platform: "darwin", env: {}, home });
	assert.ok(iterm.args.some((a) => a.startsWith("tell current session of w to write text") && a.includes("CLAUDE_CONFIG_DIR")));

	for (const account of ["", "~/.claude", "/Users/nick/.claude/"]) {
		const plain = launchCommand({ folder: "~", command: "claude", terminal: "terminal", account }, { platform: "darwin", env: {}, home });
		assert.equal(plain.profile, "", `${account || "no account"}: the default profile sets no variable`);
		assert.ok(!plain.args.some((a) => a.includes("CLAUDE_CONFIG_DIR")));
		assert.equal(plain.env, null);
	}

	const win = launchCommand({ folder: "/work", command: "claude", terminal: "cmd", account: "~/.claude-work" }, { platform: "win32", env: { PATH: "/bin" }, home });
	assert.deepEqual(win.args, ["/c", "start", "", "/d", "/work", "cmd.exe", "/k", "claude"]);
	assert.deepEqual(win.env, { PATH: "/bin", CLAUDE_CONFIG_DIR: "/Users/nick/.claude-work" }, "Windows passes the profile through the environment");
});
