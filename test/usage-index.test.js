import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { getPeriod } from "../src/periods.js";
import { formatTokens } from "../src/format.js";
import { UsageIndex, addDays, dayKey, resolveRoots, startOfDay } from "../src/usage-index.js";
import { assistantLines, taskResultLine, userLine } from "./fixtures.js";

const NOW = new Date(2026, 9, 20, 15, 30); // Tue 20 Oct 2026, local time
const at = (daysAgo, hour = 12) => {
	const d = addDays(startOfDay(NOW), -daysAgo);
	d.setHours(hour);
	return d;
};
const TODAY = dayKey(NOW);

function tmpdir() {
	return fs.mkdtempSync(path.join(os.tmpdir(), "claude-tokens-"));
}

function append(file, lines, newline = true) {
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.appendFileSync(file, lines.join("\n") + (newline ? "\n" : ""));
}

/** Token counters of a totals object, without the cost. */
const tokensOf = ({ cost, ...rest }) => rest;

function indexFor(root, options = {}) {
	return new UsageIndex(() => [root], { now: () => NOW, ...options });
}

test("counts each response once, also across resumed sessions, and skips sub-agent summaries", async () => {
	const root = tmpdir();
	const a = assistantLines({ at: at(0), tokens: { input: 10, output: 200, cacheWrite: 3000, cacheRead: 40000 } });
	const b = assistantLines({ at: at(1), tokens: { input: 5, output: 100, cacheRead: 1000 }, blocks: ["text"] });
	assert.equal(a.length, 3);
	append(path.join(root, "-Users-nick-app", "s1.jsonl"), [
		userLine({ at: at(0) }),
		...a,
		taskResultLine({ at: at(0), tokens: { input: 1e6, output: 1e6 } }),
		...b,
	]);
	append(path.join(root, "-Users-nick-app", "s2.jsonl"), a); // `claude --resume` copies history

	const index = indexFor(root);
	await index.refresh();
	assert.deepEqual(tokensOf(index.day(TODAY)), { input: 10, output: 200, cacheWrite: 3000, cacheRead: 40000, requests: 1 });
	assert.deepEqual(tokensOf(index.day(dayKey(at(1)))), { input: 5, output: 100, cacheWrite: 0, cacheRead: 1000, requests: 1 });
});

test("keeps the largest counters when the same response is logged with partial usage first", async () => {
	const root = tmpdir();
	const ids = { messageId: "msg_partial", requestId: "req_partial" };
	append(path.join(root, "p", "s.jsonl"), [
		...assistantLines({ at: at(0), tokens: { input: 3, output: 1, cacheRead: 500 }, blocks: ["thinking"], ...ids }),
		...assistantLines({ at: at(0), tokens: { input: 3, output: 750, cacheRead: 500 }, blocks: ["text"], ...ids }),
	]);
	const index = indexFor(root);
	await index.refresh();
	assert.deepEqual(tokensOf(index.day(TODAY)), { input: 3, output: 750, cacheWrite: 0, cacheRead: 500, requests: 1 });
	// cost follows the merged counters: Opus 5.5 at $4 in / $20 out / $0.20 cache read per MTok
	assert.ok(Math.abs(index.day(TODAY).cost - (3 * 4 + 750 * 20 + 500 * 0.2) / 1e6) < 1e-12);
});

test("reads only appended data, including a line that is still being written", async () => {
	const root = tmpdir();
	const file = path.join(root, "p", "s.jsonl");
	append(file, assistantLines({ at: at(0), tokens: { output: 100 }, blocks: ["text"] }));
	const index = indexFor(root);
	await index.refresh();
	assert.equal(index.day(TODAY).output, 100);

	const [line] = assistantLines({ at: at(0), tokens: { output: 50 }, blocks: ["text"] });
	fs.appendFileSync(file, line.slice(0, 40)); // half written
	await index.refresh();
	assert.equal(index.day(TODAY).output, 100);

	fs.appendFileSync(file, line.slice(40)); // complete, newline not written yet
	await index.refresh();
	assert.equal(index.day(TODAY).output, 150);

	fs.appendFileSync(file, "\n");
	await index.refresh();
	assert.equal(index.day(TODAY).output, 150, "not counted twice");

	append(file, assistantLines({ at: at(0), tokens: { output: 25 }, blocks: ["text"] }));
	const scan = await index.refresh();
	assert.equal(index.day(TODAY).output, 175);
	assert.equal(index.day(TODAY).requests, 3);
	assert.ok(scan.bytes < fs.statSync(file).size / 2, "only the tail is read");
});

test("ignores entries older than the window and files untouched since then", async () => {
	const root = tmpdir();
	const old = path.join(root, "p", "old.jsonl");
	append(old, assistantLines({ at: at(60), tokens: { output: 1000 }, blocks: ["text"] }));
	const past = at(60).getTime() / 1000;
	fs.utimesSync(old, past, past);
	append(path.join(root, "p", "mixed.jsonl"), [
		...assistantLines({ at: at(45), tokens: { output: 1000 }, blocks: ["text"] }),
		...assistantLines({ at: at(2), tokens: { output: 7 }, blocks: ["text"] }),
	]);
	const index = indexFor(root, { windowDays: 40 });
	await index.refresh();
	assert.equal(index.sum([...index.days.keys()]).output, 7);
	assert.equal(index.files.has(old), false);
});

test("handles lines longer than a read chunk and survives oversized lines", async () => {
	const root = tmpdir();
	append(path.join(root, "p", "s.jsonl"), [
		...assistantLines({ at: at(0), tokens: { output: 1000 }, blocks: ["text"], text: "y".repeat(17 << 20) }), // > 16 MB: skipped
		...assistantLines({ at: at(0), tokens: { output: 11 }, blocks: ["text"], text: "x".repeat(2.5 * (1 << 20)) }), // spans 3 chunks
		userLine({ at: at(0), text: "é".repeat(1 << 20) }), // multi-byte text across chunk borders
		...assistantLines({ at: at(0), tokens: { output: 5 }, blocks: ["text"] }),
	]);
	const index = indexFor(root);
	await index.refresh();
	assert.equal(index.day(TODAY).output, 16);
	assert.equal(index.day(TODAY).requests, 2);
});

test("puts usage on the local day of its timestamp", async () => {
	const root = tmpdir();
	const late = addDays(startOfDay(NOW), -1);
	late.setHours(23, 59, 30);
	append(path.join(root, "p", "s.jsonl"), assistantLines({ at: late, tokens: { output: 9 }, blocks: ["text"] }));
	const index = indexFor(root);
	await index.refresh();
	assert.equal(index.day(dayKey(late)).output, 9);
	assert.equal(index.day(TODAY).output, 0);
});

test("periods: rolling and calendar week, calendar and rolling month", () => {
	const week = getPeriod("week", {}, NOW);
	assert.equal(week.label, "7 DAYS");
	assert.deepEqual(week.days, ["2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18", "2026-10-19", "2026-10-20"]);
	assert.deepEqual(week.slots, week.days);

	const calendarWeek = getPeriod("week", { weekMode: "calendar" }, NOW);
	assert.equal(calendarWeek.label, "THIS WEEK");
	assert.deepEqual(calendarWeek.days, ["2026-10-19", "2026-10-20"]);
	assert.equal(calendarWeek.slots.length, 7);
	assert.equal(calendarWeek.slots[6], "2026-10-25");
	assert.equal(getPeriod("week", { weekMode: "calendar" }, new Date(2026, 9, 25, 10)).days.length, 7, "Sunday closes the week");

	const month = getPeriod("month", {}, NOW);
	assert.equal(month.label, "OCTOBER");
	assert.equal(month.days.length, 20);
	assert.equal(month.slots.length, 31);

	const rolling = getPeriod("month", { monthMode: "rolling" }, NOW);
	assert.equal(rolling.label, "30 DAYS");
	assert.equal(rolling.days.length, 30);
	assert.equal(rolling.days[0], "2026-09-21");

	const today = getPeriod("today", {}, NOW);
	assert.deepEqual(today.days, [TODAY]);
	assert.equal(today.slots.length, 24, "today is drawn per hour");
	assert.equal(today.today, `${TODAY}T15`);
	assert.equal(today.slots[0], `${TODAY}T00`);

	// Daylight saving time ends on 25 Oct 2026 in Europe: still 7 distinct days.
	assert.equal(new Set(getPeriod("week", {}, new Date(2026, 9, 27, 10)).days).size, 7);
});

test("periods work where a day has no local midnight (Chile, DST start)", () => {
	const code = `
		import { getPeriod } from "./src/periods.js";
		const p = getPeriod("month", {}, new Date(2026, 8, 10, 12));
		console.log(JSON.stringify(p.days));`;
	const out = execFileSync(process.execPath, ["--input-type=module", "-e", code], { env: { ...process.env, TZ: "America/Santiago" } });
	const days = JSON.parse(out.toString());
	assert.equal(days.length, 10);
	assert.equal(new Set(days).size, 10);
	assert.ok(days.includes("2026-09-06"));
});

test("finds Claude Code folders automatically and accepts custom ones", () => {
	const home = tmpdir();
	fs.mkdirSync(path.join(home, ".claude", "projects"), { recursive: true });
	fs.mkdirSync(path.join(home, ".claude-work", "projects"), { recursive: true });
	fs.mkdirSync(path.join(home, ".claude-squad"), { recursive: true }); // no projects folder
	fs.writeFileSync(path.join(home, ".claude.json"), "{}");
	fs.mkdirSync(path.join(home, ".config"), { recursive: true });
	fs.symlinkSync(path.join(home, ".claude"), path.join(home, ".config", "claude")); // same folder twice

	const roots = resolveRoots("", { home, env: {} });
	assert.equal(roots.length, 2);
	assert.equal(new Set(roots.map((r) => fs.realpathSync(r))).size, 2);
	assert.ok(roots.some((r) => r.endsWith(path.join(".claude-work", "projects"))));

	assert.deepEqual(resolveRoots("~/.claude-work\n/does/not/exist", { home, env: {} }), [path.join(home, ".claude-work", "projects")]);
	assert.deepEqual(resolveRoots(path.join(home, ".claude", "projects"), { home, env: {} }), [path.join(home, ".claude", "projects")]);
	assert.deepEqual(resolveRoots("", { home: tmpdir(), env: {} }), []);
});

test("formats tokens in millions", () => {
	const f = (n) => Object.values(formatTokens(n)).join("");
	assert.equal(f(0), "0M");
	assert.equal(f(4_000), "<0.01M");
	assert.equal(f(420_000), "0.42M");
	assert.equal(f(8_421_000), "8.42M");
	assert.equal(f(9_996_000), "10.0M");
	assert.equal(f(48_240_000), "48.2M");
	assert.equal(f(99_960_000), "100M");
	assert.equal(f(1_240_400_000), "1240M");
	assert.equal(f(123_456_000_000), "123B");
});

test("prices requests per model, cache TTL, long-context tier, fast mode and web search", async () => {
	const { requestCost, modelLabel, familyOf, contextWindow } = await import("../src/pricing.js");
	const u = (o) => ({ input: 0, output: 0, cacheWrite5m: 0, cacheWrite1h: 0, cacheRead: 0, ...o });
	const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
	close(requestCost("claude-opus-5-5", u({ input: 1e6, output: 1e6 })), 24);
	close(requestCost("claude-opus-5-5", u({ cacheWrite5m: 1e6, cacheWrite1h: 1e6, cacheRead: 1e6 })), 5 + 8 + 0.2);
	close(requestCost("claude-fable-5-1", u({ cacheRead: 1e6 })), 0.25);
	close(requestCost("claude-fable-5", u({ cacheRead: 1e6 })), 1);
	close(requestCost("claude-sonnet-5-5", u({ input: 1e6, output: 1e6 })), 12);
	close(requestCost("claude-sonnet-4-5-20250929", u({ input: 100_000 })), 0.3);
	close(requestCost("claude-sonnet-4-5-20250929", u({ input: 300_000 })), 1.8); // > 200K prompt: $6/MTok
	close(requestCost("claude-haiku-5-5", u({ input: 50_000, output: 1e6 })), 0.005 + 0.5);
	close(requestCost("claude-haiku-5-5", u({ input: 150_000 })), 0.075); // > 100K prompt: $0.50/MTok
	close(requestCost("claude-opus-4-1-20250805", u({ output: 1e6 })), 75);
	close(requestCost("claude-opus-4-8", u({ output: 1e6 })), 25);
	close(requestCost("claude-opus-5-5", u({ output: 1e6, fast: true })), 40);
	close(requestCost("claude-opus-5-5", u({ webSearches: 3 })), 0.03);
	close(requestCost("claude-opus-9", u({ input: 1e6 })), 4); // unknown version: latest family price
	assert.equal(requestCost("<synthetic>", u({ input: 1e6 })), 0);

	assert.equal(modelLabel("claude-sonnet-4-5-20250929"), "Sonnet 4.5");
	assert.equal(modelLabel("claude-opus-4-20250514"), "Opus 4");
	assert.equal(modelLabel("claude-opus-5-5"), "Opus 5.5");
	assert.equal(modelLabel("claude-3-5-haiku-20241022"), "Haiku 3.5");
	assert.equal(familyOf("claude-mythos-5-1"), "fable");
	assert.equal(familyOf("gpt-5"), "other");
	assert.equal(contextWindow("claude-opus-5-5"), 1_000_000);
	assert.equal(contextWindow("claude-opus-4-8"), 1_000_000);
	assert.equal(contextWindow("claude-haiku-4-5-20251001"), 200_000);
	assert.equal(contextWindow("claude-sonnet-4-5-20250929"), 200_000);
	assert.equal(contextWindow("claude-opus-4-1-20250805"), 200_000);
});

test("keeps per-model, hourly and per-session numbers", async () => {
	const root = tmpdir();
	const file = path.join(root, "p", "s.jsonl");
	const late = new Date(NOW);
	late.setHours(14, 10);
	append(file, [
		...assistantLines({ at: at(0, 9), tokens: { input: 10, output: 100, cacheRead: 1000 }, blocks: ["text"] }),
		...assistantLines({ at: late, tokens: { input: 20, output: 300, cacheWrite: 50, cacheRead: 9000 }, blocks: ["text", "tool_use"] }),
	]);
	const sonnet = assistantLines({ at: at(0, 9), tokens: { output: 40 }, blocks: ["text"] }).map((l) => l.replace('"claude-opus-5-5"', '"claude-sonnet-5-5"'));
	append(path.join(root, "p", "agent-1.jsonl"), sonnet.map((l) => l.replace('"isSidechain":false', '"isSidechain":true')));

	const index = indexFor(root);
	await index.refresh();
	const models = index.byModel([TODAY]);
	assert.deepEqual([...models.keys()].sort(), ["claude-opus-5-5", "claude-sonnet-5-5"]);
	assert.equal(models.get("claude-opus-5-5").output, 400);
	assert.equal(models.get("claude-sonnet-5-5").output, 40);
	assert.equal(index.hour(`${TODAY}T09`).output, 140);
	assert.equal(index.hour(`${TODAY}T14`).output, 300);

	const [session] = index.recentSessions();
	assert.equal(session.at, late.getTime(), "the latest main-thread request, not the sub-agent");
	assert.equal(session.context, 20 + 50 + 9000);
	assert.equal(session.model, "claude-opus-5-5");
	assert.equal(index.recentSessions().length, 1, "all fixture lines share one session id per call, sub-agents excluded");
});
