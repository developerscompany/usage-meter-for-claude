// Number and time formats that fit on a 144 px key.

/** Tokens in millions, with as much precision as fits: 0.42M, 8.42M, 48.2M, 482M, 1240M. */
export function formatTokens(n) {
	if (!n) return { num: "0", unit: "M" };
	const m = n / 1e6;
	if (m < 0.01) return { num: "<0.01", unit: "M" };
	if (m < 9.995) return { num: m.toFixed(2), unit: "M" };
	if (m < 99.95) return { num: m.toFixed(1), unit: "M" };
	if (m < 99999.5) return { num: String(Math.round(m)), unit: "M" };
	return { num: (m / 1000).toFixed(0), unit: "B" };
}

/** US dollars: $0.42, $8.42, $48.2, $482, $1234, $12.3K. */
export function formatUsd(v) {
	if (!v) return { num: "$0", unit: "" };
	if (v < 0.01) return { num: "<$0.01", unit: "" };
	if (v < 9.995) return { num: `$${v.toFixed(2)}`, unit: "" };
	if (v < 99.95) return { num: `$${v.toFixed(1)}`, unit: "" };
	if (v < 9999.5) return { num: `$${Math.round(v)}`, unit: "" };
	return { num: `$${(v / 1000).toFixed(1)}`, unit: "K" };
}

export const joined = ({ num, unit }) => num + unit;

/** Dollar amount for small text: $8.42, $12.30, $50, $1,234. */
export function formatMoney(v) {
	if (v >= 100 || Number.isInteger(v)) return `$${Math.round(v).toLocaleString("en-US")}`;
	return `$${v.toFixed(2)}`;
}

/** Compact token count: 980, 12K, 142K, 1.2M. */
export function formatCount(n) {
	if (n < 1000) return String(Math.round(n));
	if (n < 999_500) return `${Math.round(n / 1000)}K`;
	const m = n / 1e6;
	return Number.isInteger(m) || m >= 9.95 ? `${Math.round(m)}M` : `${m.toFixed(1)}M`;
}

/** Time left: 2d13h, 2h05m, 47m, <1m. */
export function formatDuration(ms) {
	if (!(ms > 0)) return "0m";
	const minutes = Math.floor(ms / 60_000);
	if (minutes < 1) return "<1m";
	if (minutes < 60) return `${minutes}m`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h${String(minutes % 60).padStart(2, "0")}m`;
	const days = Math.floor(hours / 24);
	return hours % 24 ? `${days}d${hours % 24}h` : `${days}d`;
}

/** Time since: now, 5m, 3h, 2d. */
export function formatAge(ms) {
	if (!(ms >= 60_000)) return "now";
	const minutes = Math.floor(ms / 60_000);
	if (minutes < 60) return `${minutes}m`;
	const hours = Math.floor(minutes / 60);
	return hours < 24 ? `${hours}h` : `${Math.floor(hours / 24)}d`;
}

/** Whole percent as Claude Code shows it (rounded down), and what is left of 100. */
export function percentParts(used) {
	const u = Math.max(0, Math.min(100, Math.floor(used)));
	return { used: u, left: 100 - u };
}
