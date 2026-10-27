// Incremental reader of Claude Code transcripts (~/.claude/projects/**/*.jsonl).
//
// Claude Code writes one JSONL line per content block of a response, and every line of
// the same response repeats the same message.id and usage. Resumed sessions also copy old
// lines into a new file. So usage is de-duplicated by message id before it is summed.
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { requestCost } from "./pricing.js";

const CHUNK_SIZE = 1 << 20;
// Assistant lines are well below this; longer lines (pasted images, huge tool output) never carry usage.
const MAX_LINE = 16 << 20;
const NEWLINE = 0x0a;
const USAGE_MARK = Buffer.from('"usage":{');
const MAX_DEPTH = 6;

export const FIELDS = ["input", "output", "cacheWrite", "cacheRead"];
// Per-request counters kept for de-duplication; cacheWrite1h and webSearches only matter for the price.
const RECORD_FIELDS = [...FIELDS, "cacheWrite1h", "webSearches"];

export function emptyTotals() {
	return { input: 0, output: 0, cacheWrite: 0, cacheRead: 0, requests: 0, cost: 0 };
}

function addTotals(target, source) {
	for (const f of FIELDS) target[f] += source[f];
	target.requests += source.requests;
	target.cost += source.cost;
}

/** Local calendar day as "YYYY-MM-DD". */
export function dayKey(date) {
	const m = date.getMonth() + 1;
	const d = date.getDate();
	return `${date.getFullYear()}-${m < 10 ? "0" : ""}${m}-${d < 10 ? "0" : ""}${d}`;
}

/** Local hour as "YYYY-MM-DDTHH". */
export function hourKey(date) {
	const h = date.getHours();
	return `${dayKey(date)}T${h < 10 ? "0" : ""}${h}`;
}

export function startOfDay(date) {
	const d = new Date(date);
	d.setHours(0, 0, 0, 0);
	return d;
}

export function addDays(date, days) {
	const d = new Date(date);
	d.setDate(d.getDate() + days);
	return d;
}

export function expandHome(p, home = os.homedir()) {
	if (p === "~") return home;
	if (p.startsWith("~/") || p.startsWith("~\\")) return path.join(home, p.slice(2));
	return p;
}

function isDir(p) {
	try {
		return fs.statSync(p).isDirectory();
	} catch {
		return false;
	}
}

/**
 * Folders that hold Claude Code transcripts.
 * @param {string} custom user-supplied folders (one per line, or comma separated); empty = auto-detect
 */
export function resolveRoots(custom = "", { home = os.homedir(), env = process.env } = {}) {
	const candidates = [];
	const list = String(custom ?? "")
		.split(/[\n,;]/)
		.map((s) => s.trim())
		.filter(Boolean);

	if (list.length) {
		for (const p of list) {
			const dir = path.resolve(expandHome(p, home));
			const projects = path.join(dir, "projects");
			candidates.push(isDir(projects) ? projects : dir);
		}
	} else {
		for (const dir of String(env.CLAUDE_CONFIG_DIR ?? "").split(",")) {
			if (dir.trim()) candidates.push(path.join(expandHome(dir.trim(), home), "projects"));
		}
		candidates.push(path.join(env.XDG_CONFIG_HOME || path.join(home, ".config"), "claude", "projects"));
		candidates.push(path.join(home, ".claude", "projects"));
		// Extra Claude Code profiles, e.g. ~/.claude-work used via CLAUDE_CONFIG_DIR.
		try {
			for (const ent of fs.readdirSync(home, { withFileTypes: true })) {
				if (ent.isDirectory() && /^\.claude[-_.]./i.test(ent.name)) {
					candidates.push(path.join(home, ent.name, "projects"));
				}
			}
		} catch {
			// unreadable home directory: keep the defaults
		}
	}

	const seen = new Set();
	const roots = [];
	for (const dir of candidates) {
		if (!isDir(dir)) continue;
		let real;
		try {
			real = fs.realpathSync(dir);
		} catch {
			continue;
		}
		if (seen.has(real)) continue;
		seen.add(real);
		roots.push(dir);
	}
	return roots;
}

async function collectJsonl(dir, out, depth) {
	let entries;
	try {
		entries = await fsp.readdir(dir, { withFileTypes: true });
	} catch {
		return;
	}
	for (const ent of entries) {
		const full = path.join(dir, ent.name);
		if (ent.isDirectory()) {
			if (depth < MAX_DEPTH && ent.name !== "node_modules" && ent.name !== ".git") {
				await collectJsonl(full, out, depth + 1);
			}
		} else if (ent.isFile() && ent.name.endsWith(".jsonl")) {
			out.push(full);
		}
	}
}

function tokens(value) {
	return typeof value === "number" && value > 0 ? value : 0;
}

function costOf(model, t, fast) {
	const cacheWrite1h = Math.min(t.cacheWrite1h, t.cacheWrite);
	return requestCost(model, {
		input: t.input,
		output: t.output,
		cacheWrite5m: t.cacheWrite - cacheWrite1h,
		cacheWrite1h,
		cacheRead: t.cacheRead,
		webSearches: t.webSearches,
		fast,
	});
}

export class UsageIndex {
	/**
	 * @param {() => string[]} getRoots folders to scan; called on every scan so new profiles are picked up
	 * @param {{ windowDays?: number, now?: () => Date }} [options]
	 */
	constructor(getRoots, { windowDays = 40, now = () => new Date() } = {}) {
		this.getRoots = getRoots;
		this.windowDays = windowDays;
		this.now = now;
		this.roots = [];
		this.lastScan = null;
		this.scanning = null;
		this.reset(0);
	}

	reset(windowStartMs) {
		this.windowStartMs = windowStartMs;
		this.files = new Map(); // path -> { offset, size, mtimeMs }
		this.seen = new Map(); // message id -> counters of that response, its day/hour/model and cost
		this.days = new Map(); // "YYYY-MM-DD" -> Map(model -> totals)
		this.hours = new Map(); // "YYYY-MM-DDTHH" -> totals of all models
		this.sessions = new Map(); // session id -> latest main-thread request { at, model, context, cwd }
	}

	/** Reads whatever was appended since the previous call. Concurrent calls share one scan. */
	refresh() {
		this.scanning ??= this.scan().finally(() => {
			this.scanning = null;
		});
		return this.scanning;
	}

	async scan() {
		const started = Date.now();
		// Start from scratch once a day so memory stays bounded to the window.
		const windowStartMs = startOfDay(addDays(this.now(), 1 - this.windowDays)).getTime();
		if (windowStartMs !== this.windowStartMs) this.reset(windowStartMs);

		this.roots = this.getRoots();
		const files = [];
		for (const root of this.roots) await collectJsonl(root, files, 0);

		let bytes = 0;
		let errors = 0;
		const present = new Set(files);
		for (const file of files) {
			try {
				const st = await fsp.stat(file);
				if (st.mtimeMs < this.windowStartMs) continue; // nothing new enough in it
				bytes += await this.readAppended(file, st);
			} catch {
				errors++;
			}
		}
		// Forget deleted files; the tokens they contributed stay counted.
		for (const file of this.files.keys()) if (!present.has(file)) this.files.delete(file);

		this.lastScan = { at: Date.now(), ms: Date.now() - started, files: files.length, bytes, errors };
		return this.lastScan;
	}

	async readAppended(file, st) {
		let state = this.files.get(file);
		if (!state) this.files.set(file, (state = { offset: 0, size: -1, mtimeMs: 0 }));
		if (st.size === state.size && st.mtimeMs === state.mtimeMs) return 0;
		if (st.size < state.offset) state.offset = 0; // rewritten

		const from = state.offset;
		let pos = from;
		let pending = []; // pieces of a line that continues in the next chunk
		let pendingLen = 0;
		const fh = await fsp.open(file, "r");
		try {
			while (pos < st.size) {
				const buf = Buffer.allocUnsafe(Math.min(CHUNK_SIZE, st.size - pos));
				const { bytesRead } = await fh.read(buf, 0, buf.length, pos);
				if (bytesRead === 0) break;
				const chunk = bytesRead < buf.length ? buf.subarray(0, bytesRead) : buf;
				const chunkStart = pos;
				pos += bytesRead;

				let start = 0;
				if (pendingLen) {
					const nl = chunk.indexOf(NEWLINE);
					if (nl === -1) {
						if (pendingLen + chunk.length <= MAX_LINE) pending.push(chunk);
						pendingLen += chunk.length;
						continue;
					}
					if (pendingLen + nl <= MAX_LINE) {
						pending.push(chunk.subarray(0, nl));
						const line = Buffer.concat(pending);
						this.scanLines(line, 0, line.length);
					}
					pending = [];
					pendingLen = 0;
					start = nl + 1;
					state.offset = chunkStart + start;
				}

				const last = chunk.lastIndexOf(NEWLINE);
				if (last >= start) {
					this.scanLines(chunk, start, last);
					start = last + 1;
					state.offset = chunkStart + start;
				}
				if (start < chunk.length) {
					pending.push(chunk.subarray(start));
					pendingLen = chunk.length - start;
				}
			}
		} finally {
			await fh.close();
		}

		// A last line without a newline yet: count it now if it is already complete JSON.
		// The offset stays before it, so it is read again later; the id check prevents double counting.
		if (pendingLen && pendingLen <= MAX_LINE) {
			const line = Buffer.concat(pending);
			this.scanLines(line, 0, line.length);
		}

		state.size = st.size;
		state.mtimeMs = st.mtimeMs;
		return pos - from;
	}

	/** Parses the lines of buf[start, end) that mention usage. */
	scanLines(buf, start, end) {
		let pos = start;
		while (pos < end) {
			const hit = buf.indexOf(USAGE_MARK, pos);
			if (hit === -1 || hit >= end) return;
			const lineStart = Math.max(start, buf.lastIndexOf(NEWLINE, hit) + 1);
			let lineEnd = buf.indexOf(NEWLINE, hit);
			if (lineEnd === -1 || lineEnd > end) lineEnd = end;
			this.addLine(buf.toString("utf8", lineStart, lineEnd));
			pos = lineEnd + 1;
		}
	}

	addLine(text) {
		// Tool results of sub-agents also contain "usage", but only assistant lines are API responses.
		if (!text.includes('"assistant"')) return;
		let entry;
		try {
			entry = JSON.parse(text);
		} catch {
			return;
		}
		if (entry?.type !== "assistant") return;
		const message = entry.message;
		const usage = message?.usage;
		if (!usage || typeof usage !== "object") return;
		const ts = Date.parse(entry.timestamp);
		if (!(ts >= this.windowStartMs)) return;

		const cacheWrite = tokens(usage.cache_creation_input_tokens);
		const t = {
			input: tokens(usage.input_tokens),
			output: tokens(usage.output_tokens),
			cacheWrite,
			cacheRead: tokens(usage.cache_read_input_tokens),
			cacheWrite1h: Math.min(cacheWrite, tokens(usage.cache_creation?.ephemeral_1h_input_tokens)),
			webSearches: tokens(usage.server_tool_use?.web_search_requests),
		};
		if (!(t.input || t.output || t.cacheWrite || t.cacheRead)) return;
		const model = typeof message.model === "string" ? message.model : "unknown";
		const fast = usage.speed === "fast";

		if (!entry.isSidechain) this.noteSession(entry, ts, model, t);

		const id = message.id || entry.requestId;
		const prev = id && this.seen.get(id);
		if (prev) {
			// Same response logged again: keep the largest value of each counter.
			const delta = emptyTotals();
			let grew = false;
			for (const f of RECORD_FIELDS) {
				if (t[f] > prev[f]) {
					if (f in delta) delta[f] = t[f] - prev[f];
					prev[f] = t[f];
					grew = true;
				}
			}
			if (!grew) return;
			const cost = costOf(prev.model, prev, prev.fast);
			delta.cost = cost - prev.cost;
			prev.cost = cost;
			this.addToBuckets(prev.day, prev.hour, prev.model, delta);
			return;
		}

		const at = new Date(ts);
		const record = { day: dayKey(at), hour: hourKey(at), model, fast, ...t, cost: costOf(model, t, fast) };
		this.addToBuckets(record.day, record.hour, model, { ...t, requests: 1, cost: record.cost });
		if (id) this.seen.set(id, record);
	}

	addToBuckets(day, hour, model, delta) {
		let models = this.days.get(day);
		if (!models) this.days.set(day, (models = new Map()));
		let bucket = models.get(model);
		if (!bucket) models.set(model, (bucket = emptyTotals()));
		addTotals(bucket, delta);
		let hourly = this.hours.get(hour);
		if (!hourly) this.hours.set(hour, (hourly = emptyTotals()));
		addTotals(hourly, delta);
	}

	noteSession(entry, ts, model, t) {
		const id = entry.sessionId || "unknown";
		const known = this.sessions.get(id);
		if (known && known.at > ts) return;
		this.sessions.set(id, {
			id,
			at: ts,
			model,
			context: t.input + t.cacheWrite + t.cacheRead,
			output: t.output,
			cwd: typeof entry.cwd === "string" ? entry.cwd : "",
		});
	}

	/** Main-thread sessions, most recent first. */
	recentSessions(limit = 5) {
		return [...this.sessions.values()].sort((a, b) => b.at - a.at).slice(0, limit);
	}

	/** Totals for one local day ("YYYY-MM-DD"), all models. */
	day(key) {
		const total = emptyTotals();
		for (const bucket of this.days.get(key)?.values() ?? []) addTotals(total, bucket);
		return total;
	}

	/** Totals for one local hour ("YYYY-MM-DDTHH"). */
	hour(key) {
		return this.hours.get(key) ?? emptyTotals();
	}

	/** Totals over a list of local days. */
	sum(days) {
		const total = emptyTotals();
		for (const key of days) {
			for (const bucket of this.days.get(key)?.values() ?? []) addTotals(total, bucket);
		}
		return total;
	}

	/** Totals per model over a list of local days. */
	byModel(days) {
		const out = new Map();
		for (const key of days) {
			for (const [model, bucket] of this.days.get(key) ?? []) {
				let total = out.get(model);
				if (!total) out.set(model, (total = emptyTotals()));
				addTotals(total, bucket);
			}
		}
		return out;
	}
}
