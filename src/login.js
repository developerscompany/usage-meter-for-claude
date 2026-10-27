// Claude Code's login: where it is stored and which one to use. Read only: the plugin never
// renews, changes or stores the login; Claude Code renews it whenever `claude` runs.
//
// Claude Code keeps an OAuth login (access token and expiry) in the macOS Keychain item
// "Claude Code-credentials" (a hash of the folder is appended when CLAUDE_CONFIG_DIR is set),
// or in <profile folder>/.credentials.json elsewhere. Which account is signed in (its email) is in
// the profile's config file, ~/.claude.json for the default profile.
import { execFile } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expandHome } from "./usage-index.js";

export const EXPIRY_MARGIN_MS = 60_000;

const sha = (text) => crypto.createHash("sha256").update(text).digest("hex");
const tildify = (p, home) => (p === home || p.startsWith(home + path.sep) ? `~${p.slice(home.length)}` : p);

/** Claude Code profile folder for an account setting ("" = the default ~/.claude). */
export function accountDir(account, home = os.homedir()) {
	if (!account) return path.join(home, ".claude");
	return path.resolve(expandHome(String(account).trim(), home)).replace(/[\\/]+$/, "");
}

const emails = new Map(); // config file -> { mtimeMs, email }

/** Email of the Claude account signed in to a profile ("" = the default one), or null. Never the login itself. */
export function accountEmail(account, home = os.homedir()) {
	const dir = accountDir(account, home);
	const files = dir === accountDir("", home) ? [path.join(home, ".claude.json"), path.join(dir, ".claude.json")] : [path.join(dir, ".claude.json")];
	for (const file of files) {
		try {
			const { mtimeMs } = fs.statSync(file);
			let known = emails.get(file);
			if (known?.mtimeMs !== mtimeMs) {
				const email = JSON.parse(fs.readFileSync(file, "utf8"))?.oauthAccount?.emailAddress;
				known = { mtimeMs, email: typeof email === "string" && email.includes("@") ? email : null };
				emails.set(file, known);
			}
			if (known.email) return known.email;
		} catch {
			// no config file here, or not readable yet
		}
	}
	return null;
}

/**
 * Keychain items that may hold a login for an account. "Auto" (account "") looks at the default
 * login and at every profile folder that has Claude Code logs.
 * @returns {{ service: string, dir: string }[]}
 */
export function loginCandidates(account, { home = os.homedir(), dirs = [] } = {}) {
	const out = [];
	const add = (service, dir) => {
		if (!out.some((c) => c.service === service)) out.push({ service, dir });
	};
	const hashed = (dir) => `Claude Code-credentials-${sha(dir).slice(0, 8)}`;
	const def = accountDir("", home);
	if (account) {
		const dir = accountDir(account, home);
		if (dir === def) add("Claude Code-credentials", def);
		add(hashed(dir), dir);
		add(hashed(`${dir}/`), dir);
		return out;
	}
	add("Claude Code-credentials", def);
	add(hashed(def), def);
	for (const dir of dirs) add(hashed(dir), dir);
	return out;
}

/** Keychain item names only, for tests and diagnostics. */
export const keychainServices = (account, home) => loginCandidates(account, { home }).map((c) => c.service);

/** Expiry in ms; Claude Code stores milliseconds, but accept seconds too. */
function expiryOf(value) {
	const n = Number(value);
	if (!Number.isFinite(n) || n <= 0) return null;
	return n < 1e12 ? n * 1000 : n;
}

export function parseCredentials(text) {
	try {
		const json = JSON.parse(String(text).trim());
		const oauth = json?.claudeAiOauth ?? json;
		if (typeof oauth?.accessToken !== "string" || !oauth.accessToken) return null;
		return { token: oauth.accessToken, expiresAt: expiryOf(oauth.expiresAt) };
	} catch {
		return null;
	}
}

const isValid = (login, now) => !login.expiresAt || login.expiresAt - EXPIRY_MARGIN_MS > now;

/** The login to use: a valid one that lasts longest, else the one that expired last. */
export function pickLogin(logins, now = Date.now()) {
	const byExpiry = [...logins].sort((a, b) => (b.expiresAt ?? Infinity) - (a.expiresAt ?? Infinity));
	return byExpiry.find((l) => isValid(l, now)) ?? byExpiry[0] ?? null;
}

function runSecurity(args) {
	return new Promise((resolve) => {
		execFile("/usr/bin/security", args, { timeout: 5000 }, (err, stdout) => resolve(err ? null : String(stdout)));
	});
}

function userName() {
	try {
		return process.env.USER || os.userInfo().username;
	} catch {
		return "claude-code-user";
	}
}

/**
 * Reads the Claude Code logins for an account and returns the best one, plus what was found
 * (without tokens) for the settings panel.
 * @returns {Promise<{ token: string, expiresAt: number | null, source: string, dir: string, logins: { source: string, expiresAt: number | null, dir: string }[] } | null>}
 */
export async function readCredentials(account, { platform = process.platform, home = os.homedir(), user = userName(), security = runSecurity, dirs = [], now = Date.now() } = {}) {
	const candidates = loginCandidates(account, { home, dirs });
	const logins = [];
	if (platform === "darwin") {
		for (const { service, dir } of candidates) {
			const creds = parseCredentials(await security(["find-generic-password", "-a", user, "-w", "-s", service]));
			if (creds) logins.push({ ...creds, dir, source: `Keychain «${service}» (${tildify(dir, home)})` });
		}
	}
	for (const dir of new Set(candidates.map((c) => c.dir))) {
		const file = path.join(dir, ".credentials.json");
		try {
			const creds = parseCredentials(await fsp.readFile(file, "utf8"));
			if (creds) logins.push({ ...creds, dir, source: tildify(file, home) });
		} catch {
			// no file login for this folder
		}
	}
	const best = pickLogin(logins, now);
	return best && { ...best, logins: logins.map(({ source, expiresAt, dir }) => ({ source, expiresAt, dir })) };
}
