import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { LimitsService, accountDir, keychainServices, loginCandidates, parseCredentials, parseUsage, pickLogin, readCredentials } from "../src/limits.js";
import { StatusService, modelsIn, parseSummary, statusFor, troubleOf } from "../src/status.js";
import { detectProfiles, launchProfiles } from "../src/actions/common.js";
import { accountEmail } from "../src/login.js";

const tmpdir = () => fs.mkdtempSync(path.join(os.tmpdir(), "claude-limits-"));
const sha8 = (p) => crypto.createHash("sha256").update(p).digest("hex").slice(0, 8);

export const USAGE_RESPONSE = {
	five_hour: { utilization: 25.4, resets_at: "2026-10-20T20:00:00.000Z" },
	seven_day: { utilization: 48, resets_at: "2026-10-23T09:00:00.000Z" },
	seven_day_oauth_apps: null,
	seven_day_opus: null,
	seven_day_sonnet: { utilization: 12, resets_at: "2026-10-23T09:00:00.000Z" },
	extra_usage: { is_enabled: true, monthly_limit: 5000, used_credits: 1230, utilization: 24.6 },
};

function response(status, body, headers = {}) {
	return { status, ok: status >= 200 && status < 300, headers: new Headers(headers), json: async () => body };
}

test("finds Claude Code's keychain items the way Claude Code names them", () => {
	const home = "/Users/nick";
	const hashed = (dir) => `Claude Code-credentials-${sha8(dir)}`;
	assert.deepEqual(keychainServices("", home), ["Claude Code-credentials", hashed("/Users/nick/.claude")]);
	assert.deepEqual(keychainServices("~/.claude-work/", home), [hashed("/Users/nick/.claude-work"), hashed("/Users/nick/.claude-work/")]);
	assert.deepEqual(keychainServices("~/.claude", home), ["Claude Code-credentials", hashed("/Users/nick/.claude"), hashed("/Users/nick/.claude/")]);
	const auto = loginCandidates("", { home, dirs: ["/Users/nick/.claude", "/Users/nick/.claude-n"] });
	assert.deepEqual(auto.map((c) => c.service), ["Claude Code-credentials", hashed("/Users/nick/.claude"), hashed("/Users/nick/.claude-n")]);
	assert.equal(accountDir("", home), "/Users/nick/.claude");
	assert.equal(accountDir("~/.claude-work", home), "/Users/nick/.claude-work");
});

test("reads every login, picks the freshest one, and reports what it found", async () => {
	const now = 1_800_000_000_000;
	const calls = [];
	const stored = {
		"Claude Code-credentials": { accessToken: "old", expiresAt: now - 3 * 86_400_000 },
		[`Claude Code-credentials-${sha8("/Users/nick/.claude-n")}`]: { accessToken: "fresh", expiresAt: now + 5 * 3_600_000 },
	};
	const security = async (args) => {
		calls.push(args);
		const item = stored[args.at(-1)];
		return item ? JSON.stringify({ claudeAiOauth: item }) : null;
	};
	const creds = await readCredentials("", { platform: "darwin", home: "/Users/nick", user: "nick", security, dirs: ["/Users/nick/.claude-n"], now });
	assert.equal(creds.token, "fresh");
	assert.equal(creds.source, `Keychain «Claude Code-credentials-${sha8("/Users/nick/.claude-n")}» (~/.claude-n)`);
	assert.deepEqual(creds.logins.map((l) => l.expiresAt), [now - 3 * 86_400_000, now + 5 * 3_600_000]);
	assert.ok(!JSON.stringify(creds.logins).includes("fresh"), "no tokens in the report");
	assert.deepEqual(calls[0], ["find-generic-password", "-a", "nick", "-w", "-s", "Claude Code-credentials"]);
	assert.equal(calls.length, 3);

	const home = tmpdir();
	fs.mkdirSync(path.join(home, ".claude"));
	fs.writeFileSync(path.join(home, ".claude", ".credentials.json"), JSON.stringify({ claudeAiOauth: { accessToken: "file-token", expiresAt: 9e12 } }));
	const fromFile = await readCredentials("", { platform: "linux", home, now });
	assert.equal(fromFile.token, "file-token");
	assert.equal(fromFile.source, "~/.claude/.credentials.json");
	assert.equal(await readCredentials("~/.claude-other", { platform: "linux", home }), null);

	assert.equal(parseCredentials("not json"), null);
	assert.equal(parseCredentials("{}"), null);
	assert.equal(parseCredentials(JSON.stringify({ claudeAiOauth: { accessToken: "t", expiresAt: 1_792_540_000 } })).expiresAt, 1_792_540_000_000, "seconds become milliseconds");
	assert.equal(pickLogin([{ expiresAt: now - 1 }, { expiresAt: now - 5 }], now).expiresAt, now - 1, "none valid: the one that expired last");
	assert.equal(pickLogin([{ expiresAt: now + 10 * 60_000 }, { expiresAt: null }], now).expiresAt, null, "no expiry beats any expiry");
});

test("names the account signed in to each profile, from Claude Code's config file", () => {
	const home = tmpdir();
	const config = (file, email) => fs.writeFileSync(file, JSON.stringify({ userID: "x", projects: {}, oauthAccount: { accountUuid: "a", emailAddress: email, organizationUuid: "o" } }));
	fs.mkdirSync(path.join(home, ".claude"));
	fs.mkdirSync(path.join(home, ".claude-work"));
	fs.mkdirSync(path.join(home, ".claude-new"));
	config(path.join(home, ".claude.json"), "you@example.com");
	config(path.join(home, ".claude-work", ".claude.json"), "work@example.com");
	assert.equal(accountEmail("", home), "you@example.com", "the default profile keeps it in ~/.claude.json");
	assert.equal(accountEmail("~/.claude", home), "you@example.com");
	assert.equal(accountEmail("~/.claude-work", home), "work@example.com");
	assert.equal(accountEmail("~/.claude-new", home), null, "not signed in yet");

	assert.deepEqual(detectProfiles(home), [
		{ value: "", label: "Auto (freshest login)" },
		{ value: "~/.claude", label: "~/.claude · you@example.com" },
		{ value: "~/.claude-new", label: "~/.claude-new" },
		{ value: "~/.claude-work", label: "~/.claude-work · work@example.com" },
	]);
	assert.deepEqual(launchProfiles(home)[0], { value: "", label: "Default (~/.claude) · you@example.com" }, "a Launch key's default sets no profile");
	assert.ok(!launchProfiles(home).some((p) => p.value === "~/.claude"));

	// signing in to another account changes the file
	const file = path.join(home, ".claude-work", ".claude.json");
	config(file, "other@example.com");
	fs.utimesSync(file, new Date(), new Date(Date.now() + 5000));
	assert.equal(accountEmail("~/.claude-work", home), "other@example.com");
});

test("parses the usage answer", () => {
	const usage = parseUsage(USAGE_RESPONSE);
	assert.deepEqual(usage.fiveHour, { used: 25.4, resetsAt: Date.parse("2026-10-20T20:00:00.000Z") });
	assert.equal(usage.sevenDay.used, 48);
	assert.equal(usage.sonnet.used, 12);
	assert.equal(usage.opus, null);
	assert.deepEqual(usage.extra, { enabled: true, limit: 50, spent: 12.3, used: 24.6 });
	assert.deepEqual(usage.fields, ["five_hour", "seven_day", "seven_day_sonnet", "extra_usage"], "what the server sent, without empty fields");
	assert.deepEqual(parseUsage({ five_hour: { utilization: 0, resets_at: null } }).fiveHour, { used: 0, resetsAt: null });
	assert.equal(parseUsage({ extra_usage: { is_enabled: false, monthly_limit: null, used_credits: null, utilization: null } }).extra.limit, null);
});

test("parses included credits and the newer per-model limits", () => {
	const usage = parseUsage({
		...USAGE_RESPONSE,
		seven_day_sonnet: null,
		wattle_ember: {
			utilization: 11.2,
			resets_at: "2026-11-05T07:59:00.000Z",
			label: "Cloud session credits",
			limit_dollars: 250,
			used_dollars: 28,
			remaining_dollars: 222,
			periods: [{ starts_at: "2026-10-05T08:00:00.000Z", ends_at: "2026-11-05T07:59:00.000Z" }],
		},
		cinder_cove: { utilization: 40, resets_at: "2026-11-01T00:00:00.000Z" },
		limits: [
			{ kind: "weekly", group: "model", percent: 33, resets_at: "2026-10-23T09:00:00.000Z", scope: { model: { display_name: "Sonnet" }, surface: null } },
			{ kind: "weekly", group: "surface", percent: 50, scope: { model: null, surface: { display_name: "Claude Code" } } },
			{ kind: "weekly", group: "model", percent: 2, resets_at: "2026-10-23T22:00:00.000Z", scope: { model: { display_name: "Fable" }, surface: null } },
		],
	});
	assert.deepEqual(usage.credit, { label: "Cloud session credits", used: 11.2, limit: 250, spent: 28, remaining: 222, resetsAt: Date.parse("2026-11-05T07:59:00.000Z"), recurring: false });
	assert.deepEqual(usage.codeCredit, { used: 40, resetsAt: Date.parse("2026-11-01T00:00:00.000Z") });
	assert.deepEqual(usage.modelLimits, [
		{ name: "Sonnet", used: 33, resetsAt: Date.parse("2026-10-23T09:00:00.000Z") },
		{ name: "Fable", used: 2, resetsAt: Date.parse("2026-10-23T22:00:00.000Z") },
	]);
	assert.ok(usage.fields.includes("limits (3)") && usage.fields.includes("wattle_ember"));

	const renamed = parseUsage({ cloud_session_credits: { label: "Cloud session credits", limit_dollars: 250, remaining_dollars: 222, resets_at: "2026-11-05T07:59:00.000Z" } }).credit;
	assert.equal(renamed.remaining, 222, "a credit under another field name is found by its dollar amounts");
	assert.equal(renamed.label, "Cloud session credits");

	const monthly = parseUsage({
		wattle_ember: {
			limit_dollars: 250,
			remaining_dollars: 200,
			resets_at: "2026-11-01T00:00:00.000Z",
			periods: [
				{ starts_at: "2026-10-01T00:00:00.000Z", ends_at: "2026-11-01T00:00:00.000Z" },
				{ starts_at: "2026-11-01T00:00:00.000Z", ends_at: "2026-12-01T00:00:00.000Z" },
			],
		},
	}).credit;
	assert.equal(monthly.spent, 50, "missing amounts come from the others");
	assert.equal(monthly.used, 20);
	assert.equal(monthly.recurring, true, "renews before the last period ends");
	assert.equal(parseUsage({}).credit, null);
	assert.equal(parseUsage({ spend: { limit_dollars: null, remaining_dollars: null, utilization: 0 } }).credit, null, "dollar fields without amounts are no credit");
	assert.equal(parseUsage({ wattle_ember: { label: "nothing" } }).credit, null);

	const service = new LimitsService("", { dir: null, credentials: async () => null, now: () => Date.parse("2026-10-20T17:00:00.000Z") });
	service.data = usage;
	assert.deepEqual(service.window("sonnet"), { used: 33, resetsAt: Date.parse("2026-10-23T09:00:00.000Z"), reset: false }, "Sonnet from the limits list");
	assert.equal(service.window("opus"), null);
	assert.deepEqual(service.window("fable"), { used: 2, resetsAt: Date.parse("2026-10-23T22:00:00.000Z"), reset: false }, "Fable has only the limits list");
	assert.equal(service.window("haiku"), null);
	assert.deepEqual(parseUsage({ seven_day_haiku: { utilization: 5, resets_at: null } }).haiku, { used: 5, resetsAt: null }, "a field of its own would do too");
	service.sample(Date.parse("2026-10-20T17:00:00.000Z"));
	assert.deepEqual(service.series("fable"), [[Date.parse("2026-10-20T17:00:00.000Z"), 2]], "and its own history column");
});

test("fetches limits with the OAuth token, keeps history and a cache on disk", async () => {
	const dir = tmpdir();
	let clock = Date.parse("2026-10-20T17:00:00.000Z");
	const requests = [];
	const fetchImpl = async (url, options) => {
		requests.push({ url, headers: options.headers });
		return response(200, USAGE_RESPONSE);
	};
	const service = new LimitsService("", { dir, fetchImpl, credentials: async () => ({ token: "tok", expiresAt: clock + 3_600_000 }), now: () => clock });
	await service.refresh();
	assert.equal(service.error, null);
	assert.equal(requests[0].url, "https://api.anthropic.com/api/oauth/usage");
	assert.equal(requests[0].headers.Authorization, "Bearer tok");
	assert.equal(requests[0].headers["anthropic-beta"], "oauth-2025-04-20");
	assert.deepEqual(service.window("fiveHour"), { used: 25.4, resetsAt: Date.parse("2026-10-20T20:00:00.000Z"), reset: false });

	clock += 60_000;
	await service.refresh(); // same numbers a minute later: no new history point
	assert.equal(service.history.length, 1);
	clock += 5 * 60_000;
	await service.refresh();
	assert.equal(service.history.length, 2);
	assert.deepEqual(service.series("sevenDay").map((p) => p[1]), [48, 48]);

	const reloaded = new LimitsService("", { dir, fetchImpl, credentials: async () => null, now: () => clock });
	assert.equal(reloaded.data.sevenDay.used, 48, "last numbers survive a restart");
	assert.equal(reloaded.history.length, 2);
	assert.ok(!fs.readFileSync(reloaded.cacheFile, "utf8").includes("tok"), "the token is never written to disk");

	clock = Date.parse("2026-10-20T20:00:01.000Z");
	assert.deepEqual(service.window("fiveHour"), { used: 0, resetsAt: null, reset: true }, "after the reset time the window is empty");
});

test("without a login it does not call the API; an expired-looking login is tried anyway", async () => {
	const clock = 1_000_000_000_000;
	let calls = 0;
	const fetchImpl = async () => (calls++, response(200, USAGE_RESPONSE));
	const signedOut = new LimitsService("", { dir: null, fetchImpl, credentials: async () => null, now: () => clock });
	await signedOut.refresh();
	assert.equal(signedOut.error.code, "signin");
	assert.equal(calls, 0);

	const old = { token: "t", expiresAt: clock - 3_600_000, source: "Keychain «Claude Code-credentials» (~/.claude)", logins: [] };
	const accepted = new LimitsService("", { dir: null, fetchImpl, credentials: async () => old, now: () => clock });
	await accepted.refresh();
	assert.equal(calls, 1);
	assert.equal(accepted.error, null, "the server accepted it, so the expiry date was only a hint");
	assert.equal(accepted.loginInfo().source, old.source);

	const refused = new LimitsService("", { dir: null, fetchImpl: async () => response(401, {}), credentials: async () => old, now: () => clock });
	await refused.refresh();
	assert.equal(refused.error.code, "expired");
	assert.match(refused.error.message, /Run `claude` in Terminal/);
	assert.equal(refused.retryAt, clock + 60_000, "checks again a minute later");
});

test("backs off after errors and honours Retry-After", async () => {
	let clock = 1_000_000_000_000;
	let reads = 0;
	const answers = [response(429, {}, { "retry-after": "120" }), response(401, {}), response(500, {}), response(200, USAGE_RESPONSE)];
	let calls = 0;
	const fetchImpl = async () => answers[calls++];
	const service = new LimitsService("", { dir: null, fetchImpl, credentials: async () => (reads++, { token: "t", expiresAt: null }), now: () => clock });

	await service.refresh();
	assert.equal(service.error.code, "rate");
	await service.refresh(true);
	assert.equal(calls, 1, "even a forced refresh waits after HTTP 429");
	clock += 121_000;
	await service.refresh();
	assert.equal(service.error.code, "auth");
	clock += 61_000;
	await service.refresh();
	assert.equal(reads, 2, "the token is read again after a 401");
	assert.equal(service.error.code, "http");
	await service.refresh(true);
	assert.equal(service.error, null, "a forced refresh skips the wait after other errors");
	assert.equal(service.data.sevenDay.used, 48);

	const offline = new LimitsService("", { dir: null, fetchImpl: async () => { throw new TypeError("fetch failed"); }, credentials: async () => ({ token: "t" }), now: () => clock });
	await offline.refresh();
	assert.equal(offline.error.code, "network");
});

test("reads the Claude status page", async () => {
	const summary = {
		page: { name: "Claude" },
		status: { indicator: "minor", description: "Partially Degraded Service" },
		components: [
			{ name: "claude.ai", status: "operational", group: false },
			{ name: "Claude API (api.anthropic.com)", status: "operational" },
			{ name: "Claude Code", status: "degraded_performance" },
			{ name: "Group", status: "major_outage", group: true },
		],
		incidents: [
			{ name: "Elevated errors on Claude Code", status: "investigating", impact: "minor", shortlink: "https://stspg.io/abc" },
			{ name: "Old", status: "resolved", impact: "major", shortlink: "https://stspg.io/old" },
		],
	};
	const parsed = parseSummary(summary);
	assert.equal(parsed.level, 2);
	assert.equal(parsed.components.length, 3);
	assert.deepEqual(statusFor(parsed, "code"), {
		level: 2,
		text: "degraded performance",
		incident: { name: "Elevated errors on Claude Code", impact: "minor", status: "investigating", url: "https://stspg.io/abc", components: [], models: [], updatedAt: 0 },
	});
	assert.equal(statusFor(parsed, "api").level, 0);
	assert.equal(statusFor(parsed, "all").text, "Partially Degraded Service");

	const service = new StatusService({ fetchImpl: async () => response(200, summary) });
	await service.refresh();
	assert.equal(service.summary.level, 2);
	const broken = new StatusService({ fetchImpl: async () => response(503, {}) });
	await broken.refresh();
	assert.equal(broken.error.code, "network");
});

test("names the Claude model an incident is about", () => {
	assert.deepEqual(modelsIn("Degraded performance for Claude Fable 5"), ["Fable 5"]);
	assert.deepEqual(modelsIn("Elevated errors on Claude Opus 5.5 and Sonnet 5.5"), ["Opus 5.5", "Sonnet 5.5"]);
	assert.deepEqual(modelsIn("We are investigating errors on requests to Claude Fable 5.1."), ["Fable 5.1"]);
	assert.deepEqual(modelsIn("Elevated errors on Claude 3.5 Sonnet"), ["Sonnet 3.5"], "the older order");
	assert.deepEqual(modelsIn("Slow responses from Haiku models"), ["Haiku"]);
	assert.deepEqual(modelsIn("Opus 4.5 is slow; Opus requests may fail"), ["Opus 4.5"], "no bare family next to a version of it");
	assert.deepEqual(modelsIn("Elevated errors on Claude Code"), []);

	const parsed = parseSummary({
		status: { indicator: "major", description: "Partial System Outage" },
		components: [
			{ name: "claude.ai", status: "degraded_performance" },
			{ name: "Claude Console (platform.claude.com)", status: "operational" },
			{ name: "Claude API (api.anthropic.com)", status: "partial_outage" },
			{ name: "Claude Code", status: "degraded_performance" },
		],
		incidents: [
			{
				name: "Degraded performance for Claude Fable 5",
				status: "investigating",
				impact: "minor",
				updated_at: "2026-10-21T19:49:00Z",
				components: [{ name: "claude.ai" }, { name: "Claude API (api.anthropic.com)" }, { name: "Claude Code" }],
			},
			{
				name: "Elevated errors on the API",
				status: "identified",
				impact: "major",
				updated_at: "2026-10-21T19:40:00Z",
				components: [{ name: "Claude API (api.anthropic.com)" }],
				incident_updates: [{ body: "Requests to Claude Opus 5.5 and Sonnet 5.5 may fail." }],
			},
		],
	});
	assert.deepEqual(parsed.incidents[1].models, ["Opus 5.5", "Sonnet 5.5"], "from the latest update when the title names none");
	const all = statusFor(parsed, "all");
	assert.equal(all.incident.name, "Elevated errors on the API", "the higher impact first");
	assert.equal(troubleOf(all.incident, "all"), "Opus 5.5 +1");
	assert.equal(troubleOf(statusFor(parsed, "code").incident, "code"), "Fable 5", "only incidents that hit the service");
	assert.equal(statusFor(parsed, "console").incident, null);
	const fable = statusFor(parsed, "fable");
	assert.equal(fable.level, 2);
	assert.equal(troubleOf(fable.incident, "fable"), "Fable 5");
	assert.equal(statusFor(parsed, "sonnet").level, 3, "major impact: partial outage");
	assert.equal(troubleOf(statusFor(parsed, "sonnet").incident, "sonnet"), "Sonnet 5.5", "only the watched family");
	assert.deepEqual(statusFor(parsed, "haiku"), { level: 0, text: "no open incidents", incident: null });
	assert.equal(troubleOf({ models: [], components: ["Claude Console (platform.claude.com)"] }, "all"), "Console", "else the one service hit");
});
