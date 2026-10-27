// Model Mix, Session Context and Claude Status keys.
import path from "node:path";
import { formatAge, formatCount, formatTokens, formatUsd, joined } from "../format.js";
import { getPeriod } from "../periods.js";
import { contextWindow, familyOf, modelLabel } from "../pricing.js";
import { MODEL_STYLES, renderModels } from "../render/models.js";
import { PERCENT_STYLES, renderPercent } from "../render/percent.js";
import { STATUS_STYLES, renderStatus } from "../render/status.js";
import { COLORS, messageKey } from "../render/svg.js";
import { COMPONENTS, STATUS_PAGE, progressOf, shortService, statusFor, troubleOf } from "../status.js";
import { PREFIX, clampNumber, clock, currentPeriod, nextPeriod, normalizePeriods, pick, styleIds } from "./common.js";
import { TOKEN_COUNTS } from "./series.js";

const FAMILY_NAMES = { opus: "Opus", sonnet: "Sonnet", haiku: "Haiku", fable: "Fable", other: "Other" };

/** Usage per model family (or per model) over some days, largest first. */
function modelItems(index, days, s) {
	const groups = new Map();
	for (const [model, t] of index.byModel(days)) {
		const family = familyOf(model);
		const key = s.group === "model" ? model : family;
		const name = s.group === "model" ? modelLabel(model) : FAMILY_NAMES[family];
		const item = groups.get(key) ?? { name, family, tokens: 0, cost: 0 };
		item.tokens += TOKEN_COUNTS.all(t);
		item.cost += t.cost;
		groups.set(key, item);
	}
	const items = [...groups.values()].map((item) => ({ ...item, value: s.metric === "cost" ? item.cost : item.tokens }));
	const total = items.reduce((sum, item) => sum + item.value, 0);
	return { total, items: items.filter((item) => item.value > 0).map((item) => ({ ...item, share: item.value / total })).sort((a, b) => b.value - a.value) };
}

export const modelsAction = {
	id: "models",
	uuid: `${PREFIX}.models`,
	styles: MODEL_STYLES,
	normalize(raw) {
		const s = { periods: ["week", "month"], weekMode: "rolling", monthMode: "calendar", paths: "", refresh: 60, periodIndex: 0, style: "donut", metric: "tokens", group: "family", ...(raw ?? {}) };
		normalizePeriods(s, ["week", "month"]);
		s.style = pick(s.style, styleIds(MODEL_STYLES), "donut");
		s.metric = pick(s.metric, ["tokens", "cost"], "tokens");
		s.group = pick(s.group, ["family", "model"], "family");
		s.refresh = clampNumber(s.refresh, 15, 3600, 60);
		return s;
	},
	needs: (s) => ({ usage: s.paths }),
	refreshSeconds: (s) => s.refresh,

	render(ctx, style = ctx.settings.style) {
		const s = ctx.settings;
		const period = currentPeriod(s, ctx.now);
		if (!ctx.usage.lastScan) return messageKey(period.label, "scanning…", { messageColor: COLORS.gray });
		const { total, items } = modelItems(ctx.usage, period.days, s);
		const totalText = s.metric === "cost" ? `${joined(formatUsd(total))} API` : `${joined(formatTokens(total))} tokens`;
		return renderModels(style, { label: period.label, items, total: totalText });
	},

	press: (ctx) => nextPeriod(ctx.settings),

	info(ctx) {
		const s = ctx.settings;
		const period = currentPeriod(s, ctx.now);
		const { items } = modelItems(ctx.usage, period.days, { ...s, group: "model" });
		return {
			table: {
				columns: ["Tokens", "API cost", "Share"],
				rows: items.map((item) => [item.name, joined(formatTokens(item.tokens)), `$${item.cost.toFixed(2)}`, `${Math.round(item.share * 100)}%`]),
				caption: `${period.label} by model`,
			},
			info: [],
			error: ctx.usageError,
		};
	},
};

const CONTEXT_STYLES = PERCENT_STYLES.filter((st) => ["ring", "bar", "number", "gauge", "segments", "battery", "pie"].includes(st.id));

function sessionWindow(session, setting) {
	if (setting !== "auto") return Number(setting);
	const known = contextWindow(session.model);
	return session.context > known ? 1_000_000 : known;
}

const project = (cwd) => {
	const name = path.basename(cwd || "") || "session";
	return name.length > 12 ? `${name.slice(0, 11)}…` : name;
};

export const contextAction = {
	id: "context",
	uuid: `${PREFIX}.context`,
	styles: CONTEXT_STYLES,
	normalize(raw) {
		const s = { style: "ring", paths: "", refresh: 15, warn: 50, danger: 80, window: "auto", sessionIndex: 0, ...(raw ?? {}) };
		s.style = pick(s.style, styleIds(CONTEXT_STYLES), "ring");
		s.paths = typeof s.paths === "string" ? s.paths.trim() : "";
		s.refresh = clampNumber(s.refresh, 5, 3600, 15);
		s.warn = clampNumber(s.warn, 1, 100, 50);
		s.danger = clampNumber(s.danger, s.warn, 100, 80);
		s.window = pick(String(s.window), ["auto", "200000", "1000000"], "auto");
		s.sessionIndex = Math.max(0, Math.floor(Number(s.sessionIndex) || 0));
		return s;
	},
	needs: (s) => ({ usage: s.paths }),
	refreshSeconds: (s) => s.refresh,

	render(ctx, style = ctx.settings.style) {
		const s = ctx.settings;
		if (!ctx.usage.lastScan) return messageKey("CONTEXT", "scanning…", { messageColor: COLORS.gray });
		const sessions = ctx.usage.recentSessions(5);
		if (!sessions.length) return messageKey("CONTEXT", "no sessions", { big: "—", messageColor: COLORS.gray });
		const i = s.sessionIndex % sessions.length;
		const session = sessions[i];
		const win = sessionWindow(session, s.window);
		return renderPercent(style, {
			label: "CONTEXT",
			used: (session.context / win) * 100,
			show: "used",
			display: { value: formatCount(session.context), unit: "", caption: `of ${formatCount(win)}` },
			footer: `${project(session.cwd)} · ${formatAge(ctx.now - session.at)}`,
			resetsAt: null,
			now: ctx.now.getTime(),
			windowMs: 1,
			warn: s.warn,
			danger: s.danger,
			tag: sessions.length > 1 ? `${i + 1}/${sessions.length}` : "",
		});
	},

	press(ctx) {
		ctx.settings.sessionIndex += 1;
		return "save";
	},

	info(ctx) {
		const sessions = ctx.usage.recentSessions(5);
		return {
			table: {
				columns: ["Context", "Model", "Last"],
				rows: sessions.map((session) => [project(session.cwd), formatCount(session.context), modelLabel(session.model), formatAge(ctx.now - session.at)]),
				highlight: sessions.length ? ctx.settings.sessionIndex % sessions.length : -1,
				caption: "Recent sessions (press the key to switch)",
			},
			info: [],
			error: ctx.usageError,
		};
	},
};

export const statusAction = {
	id: "status",
	uuid: `${PREFIX}.status`,
	styles: STATUS_STYLES,
	normalize(raw) {
		const s = { component: "all", style: "badge", refresh: 120, ...(raw ?? {}) };
		s.component = pick(s.component, Object.keys(COMPONENTS), "all");
		s.style = pick(s.style, styleIds(STATUS_STYLES), "badge");
		s.refresh = clampNumber(s.refresh, 60, 3600, 120);
		return s;
	},
	needs: () => ({ status: true }),
	refreshSeconds: (s) => s.refresh,

	render(ctx, style = ctx.settings.style) {
		const label = COMPONENTS[ctx.settings.component].label;
		const svc = ctx.status;
		if (!svc.summary) return renderStatus(style, { label, level: null, text: svc.error ? "offline" : "checking…" });
		const st = statusFor(svc.summary, ctx.settings.component);
		const troubled = st.level >= 2 && st.incident;
		const detail = troubled ? troubleOf(st.incident, ctx.settings.component) : "";
		return renderStatus(style, {
			label,
			level: st.level,
			text: troubled ? st.incident.name : st.text,
			detail,
			// with the model named, the title would only repeat it: say how far the fix is instead
			notes: detail ? progressOf(st.incident) : undefined,
			stale: !!svc.error,
		});
	},

	press(ctx) {
		const svc = ctx.status;
		const st = svc.summary && statusFor(svc.summary, ctx.settings.component);
		return { url: st?.level && st.incident ? st.incident.url : STATUS_PAGE };
	},

	info(ctx) {
		const svc = ctx.status;
		const summary = svc.summary;
		return {
			table: summary ? { columns: ["Status"], rows: summary.components.map((c) => [c.name, c.status.replace(/_/g, " ")]) } : null,
			info: [
				...(summary?.incidents.length
					? summary.incidents.map((i) => ["Incident", `${i.name}\n${[i.models.join(", "), i.status, i.components.length ? `affects ${i.components.map(shortService).join(", ")}` : ""].filter(Boolean).join(" · ")}`])
					: [["Incidents", "none"]]),
				["Updated", svc.fetchedAt ? clock(svc.fetchedAt) : "not yet"],
			],
			error: svc.error?.message ?? null,
		};
	},
};
