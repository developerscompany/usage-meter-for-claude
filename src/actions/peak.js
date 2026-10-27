// Peak Hours key: Claude's busy weekday hours (05:00–11:00 US Pacific), shown in your time.
import { clockRange, twelveHour } from "../clock.js";
import { formatDuration } from "../format.js";
import { peakAt, peakWindows } from "../peak.js";
import { PEAK_STYLES, renderPeak } from "../render/peak.js";
import { addDays, startOfDay } from "../usage-index.js";
import { PREFIX, clampNumber, pick, styleIds } from "./common.js";

const NOTE =
	"Anthropic set peak hours on 26 March 2026: weekdays 5–11 AM Pacific time, when 5-hour session limits drain faster. Since 6 May 2026 that no longer applies to Claude Code on Pro and Max plans; for Claude chat (web, desktop, mobile) and the Free plan no end has been announced.";

function view(s, now) {
	const w = peakAt(now);
	const midnight = startOfDay(new Date(now));
	const dayStart = midnight.getTime();
	const dayEnd = addDays(midnight, 1).getTime();
	const state = w.peak ? "peak" : s.warn > 0 && w.start - now <= s.warn * 60_000 ? "soon" : "off";
	return { state, now, start: w.start, end: w.end, day: peakWindows(dayStart, dayEnd), dayStart, dayEnd, twelve: twelveHour(s.clock), tag: s.tag };
}

export const peakAction = {
	id: "peak",
	uuid: `${PREFIX}.peak`,
	styles: PEAK_STYLES,

	normalize(raw) {
		const s = { style: "badge", warn: 30, clock: "auto", tag: "", ...(raw ?? {}) };
		s.style = pick(s.style, styleIds(PEAK_STYLES), "badge");
		s.clock = pick(String(s.clock), ["auto", "24", "12"], "auto");
		s.warn = clampNumber(s.warn, 0, 240, 30);
		s.tag = typeof s.tag === "string" ? s.tag.trim().slice(0, 3) : "";
		return s;
	},

	// the clock is all it needs; the plugin redraws every key every few seconds
	needs: () => ({}),
	refreshSeconds: () => 3600,

	render: (ctx, style = ctx.settings.style) => renderPeak(style, view(ctx.settings, ctx.now.getTime())),

	press(ctx) {
		const ids = styleIds(PEAK_STYLES);
		ctx.settings.style = ids[(ids.indexOf(ctx.settings.style) + 1) % ids.length];
		return "save";
	},

	info(ctx) {
		const now = ctx.now.getTime();
		const rows = peakWindows(now, now + 8 * 86_400_000)
			.slice(0, 5)
			.map((w) => [
				new Date(w.start).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }),
				clockRange(w.start, w.end, twelveHour(ctx.settings.clock)),
				w.start <= now ? "now" : `in ${formatDuration(w.start - now)}`,
			]);
		return {
			table: { columns: ["Your time", "Starts"], rows, highlight: 0 },
			info: [["Time zone", Intl.DateTimeFormat().resolvedOptions().timeZone || "local"]],
			note: NOTE,
		};
	},
};
