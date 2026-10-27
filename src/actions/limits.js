// Plan limit keys: 5-hour, weekly (all models / Sonnet / Opus), both on one key, credit balance and extra usage.
import { formatAge, formatDuration, formatMoney, formatUsd, joined, percentParts } from "../format.js";
import { WINDOW_MS } from "../limits.js";
import { accountEmail } from "../login.js";
import { DUAL_STYLES, renderDual } from "../render/dual.js";
import { PERCENT_STYLES, renderPercent } from "../render/percent.js";
import { COLORS, messageKey } from "../render/svg.js";
import { LIMIT_ERRORS, PREFIX, USAGE_PAGE, clock, detectProfiles, limitPress, monthDay, normalizeLimitSettings, pick, when } from "./common.js";

const WINDOW_TITLES = [
	["fiveHour", "5-hour"],
	["sevenDay", "Weekly"],
	["fable", "Weekly Fable"],
	["opus", "Weekly Opus"],
	["sonnet", "Weekly Sonnet"],
	["haiku", "Weekly Haiku"],
];

/** Key shown while there are no numbers yet. */
function waiting(label, svc, tag) {
	if (svc.error) {
		const [message, detail] = LIMIT_ERRORS[svc.error.code] ?? ["error", ""];
		return messageKey(label, message, { big: "!", color: COLORS.orange, tag, detail });
	}
	return messageKey(label, "loading…", { tag, messageColor: COLORS.gray });
}

const isStale = (svc, s, now) => !!svc.error || svc.stale(s.refresh, now);

// A login problem makes the numbers useless at once; other trouble only once they are a while old.
const LOGIN_ERRORS = ["signin", "expired", "auth"];
const OLD_AFTER_MS = 15 * 60_000;

/** What a key with numbers that are no longer current says across its bottom, or "" while they are. */
function oldNote(svc, s, now) {
	if (!isStale(svc, s, now)) return "";
	if (LOGIN_ERRORS.includes(svc.error?.code)) return LIMIT_ERRORS[svc.error.code][0];
	const age = now - svc.fetchedAt;
	return svc.fetchedAt && age >= OLD_AFTER_MS ? `${formatAge(age)} old` : "";
}

function limitsInfo(ctx) {
	const svc = ctx.limits;
	const now = ctx.now.getTime();
	const rows = [];
	for (const [name, title] of WINDOW_TITLES) {
		const w = svc.window(name, now);
		if (!w) continue;
		const { used, left } = percentParts(w.used);
		const reset = w.resetsAt ? `in ${formatDuration(w.resetsAt - now)} · ${when(w.resetsAt, now)}` : w.reset ? "reset" : "not started";
		rows.push([title, `${used}% used · ${left}% left`, reset]);
	}
	for (const m of svc.data?.modelLimits ?? []) {
		const family = ["Fable", "Opus", "Sonnet", "Haiku"].find((f) => m.name.toLowerCase().includes(f.toLowerCase()));
		if (family && rows.some((r) => r[0] === `Weekly ${family}`)) continue; // listed above already
		rows.push([`Weekly ${m.name}`, `${percentParts(m.used).used}% used`, m.resetsAt ? `in ${formatDuration(m.resetsAt - now)} · ${when(m.resetsAt, now)}` : ""]);
	}
	const credit = svc.data?.credit;
	if (credit) {
		const amount = credit.limit !== null ? `${formatMoney(Math.max(0, credit.remaining ?? 0))} of ${formatMoney(credit.limit)} left` : `${percentParts(credit.used).left}% left`;
		rows.push([credit.label ?? "Credit", amount, credit.resetsAt ? `${credit.recurring ? "resets" : "expires"} ${when(credit.resetsAt, now)}` : ""]);
	}
	const code = svc.data?.codeCredit;
	if (code) rows.push(["Claude Code and Cowork credit", `${percentParts(code.used).used}% used`, code.resetsAt ? `expires ${when(code.resetsAt, now)}` : ""]);
	const extra = svc.data?.extra;
	if (extra?.enabled) {
		rows.push(["Extra usage", extra.limit === null ? `${formatMoney(extra.spent ?? 0)} spent` : `${formatMoney(extra.spent ?? 0)} of ${formatMoney(extra.limit)}`, "1st of next month"]);
	}
	const login = svc.loginInfo();
	const validity = (l) => (!l.expiresAt ? "no expiry" : l.expiresAt > now ? `valid for ${formatDuration(l.expiresAt - now)}` : `expired ${formatAge(now - l.expiresAt)} ago`);
	const others = login ? login.logins.filter((l) => l.source !== login.source) : [];
	return {
		table: rows.length ? { columns: ["Now", "Resets"], rows } : null,
		info: [
			["Updated", svc.fetchedAt ? clock(svc.fetchedAt) : "not yet"],
			["Account", ctx.settings.account || "Auto (freshest login)"],
			...(login?.dir && accountEmail(login.dir) ? [["Signed in as", accountEmail(login.dir)]] : []),
			["Login", login ? `${login.source}, ${validity(login)}` : "not found"],
			...(others.length ? [["Also found", others.map((l) => `${l.source}, ${validity(l)}`).join("\n")]] : []),
		],
		error: svc.error?.message ?? null,
		accounts: detectProfiles(),
	};
}

function limitAction({ id, defaults, windowOf, labelOf, normalizeMore }) {
	return {
		id,
		uuid: `${PREFIX}.${id}`,
		styles: PERCENT_STYLES,
		normalize(raw) {
			const s = normalizeLimitSettings({ ...defaults, ...(raw ?? {}) }, PERCENT_STYLES);
			normalizeMore?.(s);
			return s;
		},
		needs: (s) => ({ limits: s.account }),
		refreshSeconds: (s) => s.refresh,

		render(ctx, style = ctx.settings.style) {
			const s = ctx.settings;
			const svc = ctx.limits;
			const label = labelOf(s);
			if (!svc.data) return waiting(label, svc, s.tag);
			const name = windowOf(s);
			const now = ctx.now.getTime();
			const w = svc.window(name, now);
			if (!w) return messageKey(label, "not on your plan", { big: "—", tag: s.tag, messageColor: COLORS.gray });
			return renderPercent(style, {
				label,
				used: w.used,
				show: s.show,
				resetsAt: w.resetsAt,
				reset: w.reset,
				now,
				windowMs: WINDOW_MS[name],
				warn: s.warn,
				danger: s.danger,
				series: svc.series(name),
				tag: s.tag,
				stale: isStale(svc, s, now),
				old: oldNote(svc, s, now),
			});
		},

		press: (ctx) => limitPress(ctx.settings, PERCENT_STYLES),
		info: limitsInfo,
	};
}

const LIMIT_DEFAULTS = { style: "ring", show: "left", press: "toggle", account: "", tag: "", warn: 50, danger: 80, refresh: 60 };

export const fiveHourAction = limitAction({
	id: "limit5h",
	defaults: LIMIT_DEFAULTS,
	windowOf: () => "fiveHour",
	labelOf: () => "5-HOUR",
});

const SCOPES = {
	all: { window: "sevenDay", label: "WEEKLY" },
	fable: { window: "fable", label: "FABLE 7D" },
	opus: { window: "opus", label: "OPUS 7D" },
	sonnet: { window: "sonnet", label: "SONNET 7D" },
	haiku: { window: "haiku", label: "HAIKU 7D" },
};

export const weeklyAction = limitAction({
	id: "limit7d",
	defaults: { ...LIMIT_DEFAULTS, scope: "all" },
	windowOf: (s) => SCOPES[s.scope].window,
	labelOf: (s) => SCOPES[s.scope].label,
	normalizeMore: (s) => {
		s.scope = pick(s.scope, Object.keys(SCOPES), "all");
	},
});

export const bothLimitsAction = {
	id: "limits",
	uuid: `${PREFIX}.limits`,
	styles: DUAL_STYLES,
	normalize: (raw) => normalizeLimitSettings({ ...LIMIT_DEFAULTS, style: "bars", ...(raw ?? {}) }, DUAL_STYLES),
	needs: (s) => ({ limits: s.account }),
	refreshSeconds: (s) => s.refresh,

	render(ctx, style = ctx.settings.style) {
		const s = ctx.settings;
		const svc = ctx.limits;
		if (!svc.data) return waiting("LIMITS", svc, s.tag);
		const now = ctx.now.getTime();
		return renderDual(style, {
			five: svc.window("fiveHour", now),
			week: svc.window("sevenDay", now),
			show: s.show,
			warn: s.warn,
			danger: s.danger,
			now,
			tag: s.tag,
			stale: isStale(svc, s, now),
			old: oldNote(svc, s, now),
		});
	},

	press: (ctx) => limitPress(ctx.settings, DUAL_STYLES),
	info: limitsInfo,
};

const EXTRA_STYLES = PERCENT_STYLES.filter((st) => st.id !== "history");

export const extraAction = {
	id: "extra",
	uuid: `${PREFIX}.extra`,
	styles: EXTRA_STYLES,
	normalize: (raw) => normalizeLimitSettings({ ...LIMIT_DEFAULTS, show: "used", press: "open", ...(raw ?? {}) }, EXTRA_STYLES),
	needs: (s) => ({ limits: s.account }),
	refreshSeconds: (s) => s.refresh,

	render(ctx, style = ctx.settings.style) {
		const s = ctx.settings;
		const svc = ctx.limits;
		if (!svc.data) return waiting("EXTRA", svc, s.tag);
		const e = svc.data.extra;
		if (!e?.enabled) return messageKey("EXTRA", "not enabled", { big: "OFF", tag: s.tag, messageColor: COLORS.gray });
		const d = ctx.now;
		const monthStart = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
		const nextMonth = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
		const spent = e.spent ?? 0;
		const common = { label: "EXTRA", resetsAt: nextMonth, now: d.getTime(), windowMs: nextMonth - monthStart, warn: s.warn, danger: s.danger, tag: s.tag, stale: isStale(svc, s, d.getTime()), old: oldNote(svc, s, d.getTime()) };
		if (e.limit === null) {
			return renderPercent(style, { ...common, used: 0, show: "used", display: { value: joined(formatUsd(spent)), unit: "", caption: "spent" }, footer: "no limit" });
		}
		const used = e.used ?? (e.limit > 0 ? (spent / e.limit) * 100 : 0);
		return renderPercent(style, { ...common, used, show: s.show, footer: `${formatMoney(spent)} / ${formatMoney(e.limit)}` });
	},

	press: (ctx) => limitPress(ctx.settings, EXTRA_STYLES),
	info: limitsInfo,
};

const CREDIT_STYLES = PERCENT_STYLES.filter((st) => st.id !== "history" && st.id !== "pace");

/** The cloud session credit in dollars, or the Claude Code and Cowork credit (a percentage) when chosen. */
function pickCredit(data, which) {
	if (which === "code") return data?.codeCredit ? { kind: "percent", ...data.codeCredit } : null;
	return data?.credit ? { kind: "dollars", ...data.credit } : null;
}

const NO_CREDIT_NOTE =
	"Anthropic's usage API does not send your cloud session credit, so the key cannot read it. claude.ai shows it in Settings → Usage: press the key to open that page. The key shows the credit by itself as soon as the API sends it.";
const CODE_CREDIT_SENT = " The API does send a Claude Code and Cowork credit, as a percentage: choose it under Credit to show that one.";
const NO_CODE_CREDIT_NOTE = "Anthropic's usage API does not send a Claude Code and Cowork credit for this account.";

function creditInfo(ctx) {
	const out = limitsInfo(ctx);
	const data = ctx.limits.data;
	if (!data) return out;
	out.info.push(["API fields", data.fields?.length ? data.fields.join(", ") : "—"]);
	if (!pickCredit(data, ctx.settings.which)) {
		out.note = ctx.settings.which === "code" ? NO_CODE_CREDIT_NOTE : NO_CREDIT_NOTE + (data.codeCredit ? CODE_CREDIT_SENT : "");
	}
	return out;
}

export const creditAction = {
	id: "credit",
	uuid: `${PREFIX}.credit`,
	styles: CREDIT_STYLES,
	normalize(raw) {
		const s = normalizeLimitSettings({ ...LIMIT_DEFAULTS, which: "cloud", ...(raw ?? {}) }, CREDIT_STYLES);
		// "auto" from 2.2.0 showed the percentage credit when there was no dollar one, which read as money
		s.which = pick(s.which, ["cloud", "code"], "cloud");
		return s;
	},
	needs: (s) => ({ limits: s.account }),
	refreshSeconds: (s) => s.refresh,

	render(ctx, style = ctx.settings.style) {
		const s = ctx.settings;
		const svc = ctx.limits;
		const code = s.which === "code";
		const label = code ? "CODE CREDIT" : "CLOUD CREDIT";
		if (!svc.data) return waiting(label, svc, s.tag);
		const c = pickCredit(svc.data, s.which);
		if (!c && code) return messageKey(label, "none", { big: "—", tag: s.tag, messageColor: COLORS.gray, detail: "on this account" });
		if (!c) return messageKey(label, "only on claude.ai", { big: "—", tag: s.tag, messageColor: COLORS.gray, detail: "press to open" });
		const now = ctx.now.getTime();
		// numbers fetched before the credit ran out or renewed
		const over = c.resetsAt !== null && now >= c.resetsAt;
		const used = !over ? c.used : c.recurring ? 0 : 100;
		let date = "";
		if (c.resetsAt && code) date = `${over ? "ended" : "until"} ${monthDay(c.resetsAt)}`;
		else if (c.resetsAt) date = `${over ? (c.recurring ? "reset" : "expired") : c.recurring ? "resets" : "exp"} ${monthDay(c.resetsAt)}`;
		const common = {
			label,
			used,
			show: s.show,
			resetsAt: over ? null : c.resetsAt,
			now,
			windowMs: 30 * 86_400_000,
			warn: s.warn,
			danger: s.danger,
			tag: s.tag,
			stale: isStale(svc, s, now),
			old: oldNote(svc, s, now),
			footer: date,
			until: code ? "until it ends" : c.recurring ? "until reset" : "until it expires",
		};
		if (c.kind === "dollars" && c.limit !== null) {
			// an expired credit is gone, a renewed one is full again
			const [left, spent] = !over ? [c.remaining, c.spent] : c.recurring ? [c.limit, 0] : [0, c.spent];
			return renderPercent(style, {
				...common,
				display: { value: formatMoney(Math.max(0, s.show === "left" ? left : spent)), unit: "", caption: s.show === "left" ? "left" : "spent" },
				footer: [`of ${formatMoney(c.limit)}`, date].filter(Boolean).join(" · "),
			});
		}
		return renderPercent(style, common);
	},

	press(ctx) {
		// nothing to switch: open the page that shows the credit
		if (ctx.limits.data && !pickCredit(ctx.limits.data, ctx.settings.which)) return { url: USAGE_PAGE };
		return limitPress(ctx.settings, CREDIT_STYLES);
	},
	info: creditInfo,
};
