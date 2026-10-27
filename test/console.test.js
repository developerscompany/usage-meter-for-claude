import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { ADMIN_KEY_SERVICE, ConsoleService, parseCostPages, readAdminKey, utcMonthStart } from "../src/console.js";

const bucket = (day, ...amounts) => ({ starting_at: `${day}T00:00:00Z`, ending_at: `${day}T23:59:59Z`, results: amounts.map((amount) => ({ amount, currency: "USD" })) });
const response = (status, body, headers = {}) => ({ status, ok: status >= 200 && status < 300, headers: new Headers(headers), json: async () => body });

test("cost report amounts are cents as decimal strings, summed per UTC day", () => {
	const days = parseCostPages([
		{ data: [bucket("2026-10-18", "123.45", "76.55"), bucket("2026-10-19")] },
		{ data: [bucket("2026-10-20", "1000"), { starting_at: "2026-10-21T00:00:00Z", results: [{ amount: "500", currency: "EUR" }] }] },
	]);
	assert.equal(days.get("2026-10-18"), 2);
	assert.equal(days.get("2026-10-19"), 0);
	assert.equal(days.get("2026-10-20"), 10);
	assert.equal(days.get("2026-10-21"), 0, "only USD");
});

test("fetches the cost report with the Admin key, page by page, from the day the credit was granted", async () => {
	const now = Date.parse("2026-11-03T10:00:00Z");
	const requests = [];
	const pages = [
		{ data: [bucket("2026-10-18", "500"), bucket("2026-10-31", "250")], has_more: true, next_page: "page_2" },
		{ data: [bucket("2026-11-01", "100"), bucket("2026-11-03", "25.5")], has_more: false, next_page: null },
	];
	const fetchImpl = async (url, options) => {
		requests.push({ url: new URL(url), headers: options.headers });
		return response(200, pages[requests.length - 1]);
	};
	const svc = new ConsoleService({ from: "2026-10-18", fetchImpl, readKey: async () => ({ key: "sk-ant-admin01-x", source: "test" }), now: () => now });
	await svc.refresh();
	assert.equal(svc.error, null);
	assert.equal(requests.length, 2);
	assert.equal(requests[0].url.pathname, "/v1/organizations/cost_report");
	assert.equal(requests[0].url.searchParams.get("starting_at"), "2026-10-18T00:00:00Z", "the grant day, before this month");
	assert.equal(requests[0].url.searchParams.get("bucket_width"), "1d");
	assert.equal(requests[0].url.searchParams.get("limit"), "31");
	assert.equal(requests[1].url.searchParams.get("page"), "page_2");
	assert.equal(requests[0].headers["x-api-key"], "sk-ant-admin01-x");
	assert.equal(requests[0].headers["anthropic-version"], "2023-06-01");
	assert.equal(svc.spendSince("2026-10-18"), 8.755);
	assert.equal(svc.spendSince(utcMonthStart(now)), 1.255);
	assert.equal(svc.spendOn("2026-11-03"), 0.255);

	const month = new ConsoleService({ fetchImpl: async (url) => (requests.push({ url: new URL(url) }), response(200, { data: [] })), readKey: async () => ({ key: "k", source: "t" }), now: () => now });
	await month.refresh();
	assert.equal(requests.at(-1).url.searchParams.get("starting_at"), "2026-11-01T00:00:00Z", "without a grant day: this UTC month");
});

test("no key, a refused key, rate limits", async () => {
	let clock = 1_000_000_000_000;
	const none = new ConsoleService({ readKey: async () => null, fetchImpl: async () => assert.fail("no request without a key"), now: () => clock });
	await none.refresh();
	assert.equal(none.error.code, "nokey");

	const answers = [response(429, {}, { "retry-after": "120" }), response(401, {}), response(200, { data: [bucket("2001-09-09", "100")] })];
	let calls = 0;
	const svc = new ConsoleService({ readKey: async () => ({ key: "k", source: "t" }), fetchImpl: async () => answers[calls++], now: () => clock });
	await svc.refresh();
	assert.equal(svc.error.code, "rate");
	await svc.refresh(true);
	assert.equal(calls, 1, "even a forced refresh waits after HTTP 429");
	clock += 121_000;
	await svc.refresh();
	assert.equal(svc.error.code, "auth");
	assert.match(svc.error.message, /Admin key/);
	await svc.refresh(true);
	assert.equal(svc.error, null);
	assert.equal(svc.fetchedAt, clock);
});

test("reads the Admin key from the Keychain on a Mac, else from a file; never writes it", async () => {
	const calls = [];
	const security = async (args) => (calls.push(args), "sk-ant-admin01-from-keychain\n");
	assert.deepEqual(await readAdminKey({ platform: "darwin", security }), { key: "sk-ant-admin01-from-keychain", source: `Keychain «${ADMIN_KEY_SERVICE}»` });
	assert.deepEqual(calls[0], ["find-generic-password", "-w", "-s", ADMIN_KEY_SERVICE]);

	const asked = [];
	const before = async (args) => (asked.push(args.at(-1)), args.at(-1) === "Rivo Claude Usage Admin Key" ? "sk-ant-admin01-old\n" : null);
	assert.deepEqual(await readAdminKey({ platform: "darwin", security: before }), { key: "sk-ant-admin01-old", source: "Keychain «Rivo Claude Usage Admin Key»" });
	assert.deepEqual(asked, [ADMIN_KEY_SERVICE, "Rivo Claude Usage Admin Key"], "the item named before the rename, after the new one");

	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "admin-key-"));
	assert.equal(await readAdminKey({ platform: "linux", dir }), null);
	fs.writeFileSync(path.join(dir, "admin-key"), "sk-ant-admin01-from-file\n");
	assert.deepEqual(await readAdminKey({ platform: "linux", dir }), { key: "sk-ant-admin01-from-file", source: path.join(dir, "admin-key") });
	assert.equal((await readAdminKey({ platform: "darwin", security: async () => null, dir })).key, "sk-ant-admin01-from-file", "the file when the Keychain has none");
});
