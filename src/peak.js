// Claude's peak hours: weekdays 05:00–11:00 US Pacific time, announced by Anthropic on 26 March 2026.
// During them 5-hour session limits drain faster. Since 6 May 2026 that no longer applies to Claude Code
// on Pro and Max plans; for Claude chat (web, desktop, mobile) and the Free plan no end was announced.
// Pacific time comes from the US daylight saving rules, so no time zone database is needed.

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
export const PEAK_START_HOUR = 5;
export const PEAK_END_HOUR = 11;

/** Day of the month of the n-th Sunday of a month. */
function nthSunday(year, month, n) {
	const first = new Date(Date.UTC(year, month, 1)).getUTCDay();
	return 1 + ((7 - first) % 7) + 7 * (n - 1);
}

/** Hours from UTC of US Pacific time at an instant: −7 from the 2nd Sunday of March 02:00 to the 1st Sunday of November 02:00, else −8. */
export function pacificOffset(ms) {
	const year = new Date(ms).getUTCFullYear();
	const summer = Date.UTC(year, 2, nthSunday(year, 2, 2), 10); // 02:00 PST
	const winter = Date.UTC(year, 10, nthSunday(year, 10, 1), 9); // 02:00 PDT
	return ms >= summer && ms < winter ? -7 : -8;
}

/** An hour of a Pacific calendar day as an instant. Clocks change on Sundays at 02:00, never in a weekday window. */
function pacific(year, month, day, hour) {
	const wall = Date.UTC(year, month, day, hour);
	return wall - pacificOffset(wall + 8 * HOUR) * HOUR;
}

/** Peak windows { start, end } that overlap [from, to). */
export function peakWindows(from, to) {
	const out = [];
	const first = new Date(from + pacificOffset(from) * HOUR - DAY); // the Pacific day before `from`
	for (let i = 0; i <= (to - from) / DAY + 2; i++) {
		const [y, m, d] = [first.getUTCFullYear(), first.getUTCMonth(), first.getUTCDate() + i];
		const start = pacific(y, m, d, PEAK_START_HOUR);
		if (start >= to) break;
		const weekday = new Date(Date.UTC(y, m, d)).getUTCDay();
		if (weekday === 0 || weekday === 6) continue;
		const end = pacific(y, m, d, PEAK_END_HOUR);
		if (end > from) out.push({ start, end });
	}
	return out;
}

/** The peak window going on now, or else the next one. */
export function peakAt(now) {
	const [w] = peakWindows(now, now + 8 * DAY);
	return { peak: w.start <= now, start: w.start, end: w.end };
}
