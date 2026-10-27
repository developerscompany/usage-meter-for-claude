import { addDays, dayKey, hourKey, startOfDay } from "./usage-index.js";

export const PERIOD_IDS = ["today", "week", "month"];

const MONTHS = [
	"JANUARY",
	"FEBRUARY",
	"MARCH",
	"APRIL",
	"MAY",
	"JUNE",
	"JULY",
	"AUGUST",
	"SEPTEMBER",
	"OCTOBER",
	"NOVEMBER",
	"DECEMBER",
];

function daysBetween(from, to) {
	const out = [];
	const last = dayKey(to);
	// Step at noon so days without a local midnight (DST) are not skipped.
	for (let d = new Date(from.getFullYear(), from.getMonth(), from.getDate(), 12); dayKey(d) <= last; d.setDate(d.getDate() + 1)) {
		out.push(dayKey(d));
	}
	return out;
}

/**
 * @typedef {object} Period
 * @property {string} id
 * @property {string} label   text for the key header
 * @property {string[]} days  local days counted in the total
 * @property {string[]} slots local days (or hours, when `hourly`) drawn as bars, may include ones still ahead
 * @property {string} today   the current slot key
 * @property {boolean} [hourly]
 */

/**
 * @param {"today" | "week" | "month"} id
 * @param {{ weekMode?: string, monthMode?: string }} settings
 * @returns {Period}
 */
export function getPeriod(id, settings, now = new Date()) {
	const today = startOfDay(now);
	const make = (label, from, slotsFrom, slotsTo) => ({
		id,
		label,
		days: daysBetween(from, today),
		slots: daysBetween(slotsFrom, slotsTo),
		today: dayKey(today),
	});

	if (id === "today") {
		const day = dayKey(today);
		const slots = Array.from({ length: 24 }, (_, h) => `${day}T${h < 10 ? "0" : ""}${h}`);
		return { id, label: "TODAY", days: [day], slots, today: hourKey(now), hourly: true };
	}
	if (id === "week") {
		if (settings.weekMode === "calendar") {
			const monday = addDays(today, -((today.getDay() + 6) % 7));
			return make("THIS WEEK", monday, monday, addDays(monday, 6));
		}
		const from = addDays(today, -6);
		return make("7 DAYS", from, from, today);
	}
	if (settings.monthMode === "rolling") {
		const from = addDays(today, -29);
		return make("30 DAYS", from, from, today);
	}
	const first = new Date(today.getFullYear(), today.getMonth(), 1);
	const last = new Date(today.getFullYear(), today.getMonth() + 1, 0);
	return make(MONTHS[today.getMonth()], first, first, last);
}
