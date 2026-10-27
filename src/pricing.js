// Anthropic API list prices, USD per million tokens (October 2026), to estimate what Claude Code
// usage would cost on the API. Cache writes cost 1.25× input with the 5-minute TTL and 2× with the
// 1-hour TTL; cache reads have their own price. First matching pattern wins.
const MODELS = [
	{ match: /^claude-(fable|mythos)-5-1\b/, family: "fable", input: 10, output: 50, cacheRead: 0.25 },
	{ match: /^claude-(fable|mythos)-5\b/, family: "fable", input: 10, output: 50, cacheRead: 1 },
	{ match: /^claude-opus-5-5\b/, family: "opus", input: 4, output: 20, cacheRead: 0.2 },
	{ match: /^claude-opus-5\b/, family: "opus", input: 5, output: 25, cacheRead: 0.5 },
	{ match: /^claude-opus-4-[5-9]\b/, family: "opus", input: 5, output: 25, cacheRead: 0.5 },
	{ match: /^claude-opus-4\b/, family: "opus", input: 15, output: 75, cacheRead: 1.5 },
	{ match: /^claude-sonnet-5\b/, family: "sonnet", input: 2, output: 10, cacheRead: 0.2 },
	{ match: /^claude-sonnet-4-6\b/, family: "sonnet", input: 3, output: 15, cacheRead: 0.3 },
	{ match: /^claude-sonnet-4\b/, family: "sonnet", input: 3, output: 15, cacheRead: 0.3, long: { above: 200_000, input: 6, output: 22.5, cacheRead: 0.6 } },
	{ match: /^claude-haiku-5-5\b/, family: "haiku", input: 0.1, output: 0.5, cacheRead: 0.01, long: { above: 100_000, input: 0.5, output: 2.5, cacheRead: 0.05 } },
	{ match: /^claude-haiku-4-5\b/, family: "haiku", input: 1, output: 5, cacheRead: 0.1 },
	{ match: /^claude-3-5-haiku\b/, family: "haiku", input: 0.8, output: 4, cacheRead: 0.08 },
	{ match: /^claude-3-haiku\b/, family: "haiku", input: 0.25, output: 1.25, cacheRead: 0.03 },
	{ match: /^claude-3-[57]-sonnet\b/, family: "sonnet", input: 3, output: 15, cacheRead: 0.3 },
	{ match: /^claude-3-opus\b/, family: "opus", input: 15, output: 75, cacheRead: 1.5 },
];

// Versions newer than this table: assume the current price of the family.
const LATEST = {
	fable: MODELS[0],
	opus: MODELS[2],
	sonnet: MODELS[6],
	haiku: MODELS[9],
};

const WEB_SEARCH = 0.01; // $10 per 1,000 searches
const FAST_MODE = 2; // fast mode on Opus 5 / 5.5 costs twice the standard price

export const FAMILIES = ["opus", "sonnet", "haiku", "fable", "other"];

const FAMILY_WORD = /(opus|sonnet|haiku|fable|mythos)/;

export function familyOf(model) {
	const word = FAMILY_WORD.exec(String(model))?.[1];
	if (!word) return "other";
	return word === "mythos" ? "fable" : word;
}

export function priceFor(model) {
	const id = String(model).toLowerCase();
	const known = MODELS.find((m) => m.match.test(id));
	if (known) return known;
	const family = familyOf(id);
	return LATEST[family] ?? null;
}

/** "claude-sonnet-4-5-20250929" → "Sonnet 4.5". */
export function modelLabel(model) {
	const id = String(model).toLowerCase();
	let m = /^claude-(opus|sonnet|haiku|fable|mythos)-(\d+)(?:-(\d))?\b/.exec(id);
	if (m) return `${m[1][0].toUpperCase()}${m[1].slice(1)} ${m[2]}${m[3] ? `.${m[3]}` : ""}`;
	m = /^claude-(\d)(?:-(\d))?-(opus|sonnet|haiku)\b/.exec(id);
	if (m) return `${m[3][0].toUpperCase()}${m[3].slice(1)} ${m[1]}${m[2] ? `.${m[2]}` : ""}`;
	return id.replace(/^claude-/, "").replace(/-\d{8}$/, "");
}

/**
 * Cost of one API request in USD.
 * @param {string} model
 * @param {{ input: number, output: number, cacheWrite5m: number, cacheWrite1h: number, cacheRead: number, webSearches?: number, fast?: boolean }} u
 */
export function requestCost(model, u) {
	const price = priceFor(model);
	if (!price) return 0;
	const prompt = u.input + u.cacheWrite5m + u.cacheWrite1h + u.cacheRead;
	const tier = price.long && prompt > price.long.above ? price.long : price;
	const tokens =
		u.input * tier.input +
		u.cacheWrite5m * tier.input * 1.25 +
		u.cacheWrite1h * tier.input * 2 +
		u.cacheRead * tier.cacheRead +
		u.output * tier.output;
	return ((u.fast ? FAST_MODE : 1) * tokens) / 1e6 + (u.webSearches ?? 0) * WEB_SEARCH;
}

/** Context window of a model, in tokens (current models have 1M; older ones 200K). */
export function contextWindow(model) {
	const id = String(model).toLowerCase();
	if (/^claude-3-/.test(id) || /^claude-haiku-4-5\b/.test(id)) return 200_000;
	if (/^claude-(opus|sonnet)-4-([015]|\d{8})\b/.test(id)) return 200_000;
	if (/^claude-(opus|sonnet)-4$/.test(id)) return 200_000;
	return 1_000_000;
}
