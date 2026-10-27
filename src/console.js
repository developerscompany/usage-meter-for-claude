// Claude Console (API organization) spend, from the Usage and Cost Admin API. Anthropic has no API for
// the credit balance itself, so the API Credit key takes the spend since a credit was granted off the
// amount granted. The Admin API key is only read: from the macOS Keychain item "Usage Meter for Claude Admin
// Key" (or the item named before the plugin was renamed), or else from the file admin-key in the plugin's
// data folder. It is sent to api.anthropic.com only.
import { execFile } from "node:child_process";
import fsp from "node:fs/promises";
import path from "node:path";

const COST_URL = process.env.CLAUDE_COST_URL ?? "https://api.anthropic.com/v1/organizations/cost_report";
const USER_AGENT = "usage-meter-for-claude-streamdeck/3.1";
export const ADMIN_KEY_SERVICE = "Usage Meter for Claude Admin Key";
// the Keychain item from versions before 3.0, still read so a stored key keeps working
const OLD_ADMIN_KEY_SERVICE = "Rivo Claude Usage Admin Key";
const MAX_PAGES = 13;
const MAX_BACKOFF_MS = 30 * 60_000;

/** UTC calendar day of an instant: "2026-10-18". */
export const utcDay = (ms) => new Date(ms).toISOString().slice(0, 10);

/** First day of the instant's UTC month. */
export const utcMonthStart = (ms) => `${utcDay(ms).slice(0, 8)}01`;

/** Dollars per UTC day from cost report pages, whose amounts are cents as decimal strings ("123.45" is $1.2345). */
export function parseCostPages(pages) {
	const days = new Map();
	for (const page of pages) {
		for (const bucket of page?.data ?? []) {
			const day = String(bucket?.starting_at ?? "").slice(0, 10);
			if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
			let usd = days.get(day) ?? 0;
			for (const r of bucket.results ?? []) {
				const cents = Number(r?.amount);
				if (Number.isFinite(cents) && (r.currency ?? "USD") === "USD") usd += cents / 100;
			}
			days.set(day, usd);
		}
	}
	return days;
}

function runSecurity(args) {
	return new Promise((resolve) => {
		execFile("/usr/bin/security", args, { timeout: 5000 }, (err, stdout) => resolve(err ? null : String(stdout)));
	});
}

/**
 * The Admin API key the user stored for the plugin, and where it was found (never the key in messages).
 * @returns {Promise<{ key: string, source: string } | null>}
 */
export async function readAdminKey({ platform = process.platform, security = runSecurity, dir = null } = {}) {
	if (platform === "darwin") {
		for (const service of [ADMIN_KEY_SERVICE, OLD_ADMIN_KEY_SERVICE]) {
			const key = (await security(["find-generic-password", "-w", "-s", service]))?.trim();
			if (key) return { key, source: `Keychain «${service}»` };
		}
	}
	if (dir) {
		const file = path.join(dir, "admin-key");
		try {
			const key = (await fsp.readFile(file, "utf8")).trim();
			if (key) return { key, source: file };
		} catch {
			// no key file
		}
	}
	return null;
}

export class ConsoleService {
	/**
	 * @param {{ from?: string }} options from: the earliest UTC day ("YYYY-MM-DD") a key needs, e.g. when its credit was granted
	 */
	constructor({ from = "", dir = null, log = null, fetchImpl = globalThis.fetch, readKey = readAdminKey, now = Date.now } = {}) {
		this.from = /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : "";
		this.dir = dir;
		this.log = log;
		this.fetchImpl = fetchImpl;
		this.readKey = readKey;
		this.now = now;
		this.days = new Map(); // UTC day -> dollars
		this.fetchedAt = 0;
		this.error = null; // { code: "nokey" | "auth" | "rate" | "network" | "http", message }
		this.keySource = null;
		this.failures = 0;
		this.retryAt = 0;
		this.inflight = null;
	}

	/** Fetches unless a previous error asked to wait; `force` skips that wait except after HTTP 429. */
	refresh(force = false) {
		this.inflight ??= this.fetchNow(force).finally(() => {
			this.inflight = null;
		});
		return this.inflight;
	}

	fail(code, message, retryAfterMs) {
		this.failures++;
		this.error = { code, message };
		this.retryAt = this.now() + (retryAfterMs ?? Math.min(MAX_BACKOFF_MS, 60_000 * 2 ** (this.failures - 1)));
	}

	async fetchNow(force) {
		const now = this.now();
		if (now < this.retryAt && (!force || this.error?.code === "rate")) return;
		const found = await this.readKey({ dir: this.dir });
		if (!found) {
			this.keySource = null;
			this.error = { code: "nokey", message: "No Admin API key found yet: see the steps below." };
			return;
		}
		this.keySource = found.source;
		const month = utcMonthStart(now);
		const start = this.from && this.from < month ? this.from : month;
		const pages = [];
		let page = null;
		for (let i = 0; i < MAX_PAGES; i++) {
			const url = new URL(COST_URL);
			url.searchParams.set("starting_at", `${start}T00:00:00Z`);
			url.searchParams.set("bucket_width", "1d");
			url.searchParams.set("limit", "31");
			if (page) url.searchParams.set("page", page);
			let res;
			try {
				res = await this.fetchImpl(url, {
					headers: { "x-api-key": found.key, "anthropic-version": "2023-06-01", "User-Agent": USER_AGENT },
					signal: AbortSignal.timeout(15_000),
				});
			} catch (err) {
				this.fail("network", err?.name === "TimeoutError" ? "The Admin API timed out" : `Network error: ${err?.message ?? err}`);
				return;
			}
			if (res.status === 401 || res.status === 403) {
				this.fail("auth", `The Admin API refused the key (HTTP ${res.status}). It must be an Admin key (sk-ant-admin01-…) of the organization whose credit you track.`);
				return;
			}
			if (res.status === 429) {
				const seconds = Number(res.headers.get("retry-after"));
				this.fail("rate", "Admin API rate limit; retrying later", seconds > 0 ? seconds * 1000 : undefined);
				return;
			}
			if (!res.ok) {
				this.fail("http", `Admin API error (HTTP ${res.status})`);
				return;
			}
			let body;
			try {
				body = await res.json();
			} catch {
				this.fail("http", "Unexpected answer from the Admin API");
				return;
			}
			pages.push(body);
			if (!body?.has_more || !body.next_page) break;
			page = body.next_page;
		}
		this.days = parseCostPages(pages);
		this.fetchedAt = now;
		this.error = null;
		this.failures = 0;
		this.retryAt = 0;
	}

	/** Dollars spent on the UTC days from `fromDay` up to today. */
	spendSince(fromDay) {
		let usd = 0;
		for (const [day, amount] of this.days) if (day >= fromDay) usd += amount;
		return usd;
	}

	/** Dollars spent on one UTC day. */
	spendOn(day) {
		return this.days.get(day) ?? 0;
	}

	/** True when the numbers shown are older than they should be. */
	stale(refreshSeconds, now = this.now()) {
		return !this.fetchedAt || now - this.fetchedAt > Math.max(3 * refreshSeconds * 1000, 15 * 60_000);
	}
}
