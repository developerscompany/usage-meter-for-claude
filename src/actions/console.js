// API Credit key: what is left of a Claude Console credit (such as $200 of promotional credit), worked
// out from the API spend since it was granted. Without an amount it shows this month's API spend.
// Dates are UTC, as the Console shows them.
import path from "node:path";
import { ADMIN_KEY_SERVICE, utcDay, utcMonthStart } from "../console.js";
import { formatAge, formatMoney } from "../format.js";
import { PERCENT_STYLES, renderPercent } from "../render/percent.js";
import { COLORS, messageKey } from "../render/svg.js";
import { PREFIX, clampNumber, clock, limitPress, normalizeLimitSettings } from "./common.js";

const STYLES = PERCENT_STYLES.filter((st) => st.id !== "history" && st.id !== "pace");
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const BILLING_PAGE = "https://platform.claude.com/settings/billing";

const ERRORS = {
	nokey: ["no Admin key", "see settings"],
	auth: ["key refused", "see settings"],
	rate: ["rate limited", "retrying"],
	network: ["offline", "retrying"],
	http: ["API error", "retrying"],
};

/** How to give the key an Admin API key on this computer, in short steps. */
function setup(dir, platform = process.platform) {
	const store =
		platform === "darwin"
			? `2. In Terminal, run the line below and paste the key when asked:\nsecurity add-generic-password -a "$USER" -s "${ADMIN_KEY_SERVICE}" -w`
			: `2. Save the key as the only line of this file:\n${path.join(dir ?? "", "admin-key")}`;
	return [
		"Anthropic has no API for the Console credit balance, so this key takes your API spend since the credit was granted off the amount granted.",
		"1. In the Claude Console, create an Admin key (link below).",
		store,
		"3. Enter the credit's amount and dates from the Billing page. Dates are UTC, as in the Console.",
		"The plugin only reads the key, and sends it only to api.anthropic.com.",
	].join("\n");
}

/** Dollars with cents, as the Console shows them: $190.25. */
const cents = (usd) => `$${usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** "Nov 1" for a UTC day, the same everywhere. */
const utcMonthDay = (day) => new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export const apiCreditAction = {
	id: "apicredit",
	uuid: `${PREFIX}.apicredit`,
	styles: STYLES,

	normalize(raw) {
		const s = normalizeLimitSettings({ style: "number", show: "left", press: "toggle", tag: "", warn: 50, danger: 80, amount: 0, granted: "", expires: "", ...(raw ?? {}) }, STYLES);
		s.amount = clampNumber(s.amount, 0, 10_000_000, 0); // 0: no credit set, show the month's spend
		s.granted = DATE.test(String(s.granted ?? "").trim()) ? String(s.granted).trim() : "";
		s.expires = DATE.test(String(s.expires ?? "").trim()) ? String(s.expires).trim() : "";
		s.refresh = clampNumber(raw?.refresh, 60, 3600, 300);
		return s;
	},

	needs: (s) => ({ console: s.granted }),
	refreshSeconds: (s) => s.refresh,

	render(ctx, style = ctx.settings.style) {
		const s = ctx.settings;
		const svc = ctx.console;
		const label = s.amount ? "API CREDIT" : "API SPEND";
		if (!svc.fetchedAt) {
			if (!svc.error) return messageKey(label, "loading…", { tag: s.tag, messageColor: COLORS.gray });
			const [message, detail] = ERRORS[svc.error.code] ?? ["error", ""];
			return messageKey(label, message, { big: "!", color: COLORS.orange, tag: s.tag, detail });
		}
		const now = ctx.now.getTime();
		const stale = !!svc.error || svc.stale(s.refresh, now);
		// a missing or refused key makes the numbers useless at once; other trouble once they are a while old
		const age = now - svc.fetchedAt;
		const old = ["nokey", "auth"].includes(svc.error?.code) ? ERRORS[svc.error.code][0] : stale && age >= 15 * 60_000 ? `${formatAge(age)} old` : "";
		const common = { label, now, warn: s.warn, danger: s.danger, tag: s.tag, stale, old };
		if (!s.amount) {
			const spent = svc.spendSince(utcMonthStart(now));
			return renderPercent(style, { ...common, used: 0, show: "used", display: { value: formatMoney(spent), unit: "", caption: "this month" }, footer: "Claude Console", resetsAt: null, windowMs: 1 });
		}
		const from = s.granted || utcMonthStart(now);
		const spent = Math.min(s.amount, svc.spendSince(from));
		const expiresAt = s.expires ? Date.parse(`${s.expires}T00:00:00Z`) : null;
		const over = expiresAt !== null && now >= expiresAt;
		const amount = s.show === "left" ? (over ? 0 : s.amount - spent) : spent;
		const date = s.expires ? `${over ? "expired" : "exp"} ${utcMonthDay(s.expires)}` : `since ${utcMonthDay(from)}`;
		return renderPercent(style, {
			...common,
			used: over ? 100 : (spent / s.amount) * 100,
			show: s.show,
			display: { value: formatMoney(Math.max(0, amount)), unit: "", caption: s.show === "left" ? "left" : "spent" },
			footer: `of ${formatMoney(s.amount)} · ${date}`,
			resetsAt: over ? null : expiresAt,
			windowMs: expiresAt && s.granted ? expiresAt - Date.parse(`${s.granted}T00:00:00Z`) : 30 * 86_400_000,
			until: "until it expires",
		});
	},

	press(ctx) {
		if (ctx.settings.press === "open") return { url: BILLING_PAGE };
		return limitPress(ctx.settings, STYLES);
	},

	info(ctx) {
		const s = ctx.settings;
		const svc = ctx.console;
		const now = ctx.now.getTime();
		const month = utcMonthStart(now);
		const from = s.granted || month;
		const rows = [
			["Today", cents(svc.spendOn(utcDay(now)))],
			["This month", cents(svc.spendSince(month))],
			...(s.granted ? [[`Since ${utcMonthDay(s.granted)}`, cents(svc.spendSince(s.granted))]] : []),
			...(s.amount ? [["Credit left", cents(Math.max(0, s.amount - svc.spendSince(from)))]] : []),
		];
		return {
			table: svc.fetchedAt ? { columns: ["API spend (UTC)"], rows } : null,
			info: [
				["Updated", svc.fetchedAt ? clock(svc.fetchedAt) : "not yet"],
				["Admin key", svc.keySource ?? "not found"],
			],
			error: svc.error?.message ?? null,
			note: setup(svc.dir),
		};
	},
};
