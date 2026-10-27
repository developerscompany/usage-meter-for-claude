import assert from "node:assert/strict";
import { test } from "node:test";
import { pacificOffset, peakAt, peakWindows } from "../src/peak.js";

const LA = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short" });
const inLA = (ms) => Object.fromEntries(LA.formatToParts(ms).map((p) => [p.type, p.value]));

test("Pacific time follows the US daylight saving rules, like the time zone database", () => {
	for (let t = Date.UTC(2025, 0, 1); t < Date.UTC(2029, 0, 1); t += 3 * 3_600_000) {
		const p = inLA(t);
		const wall = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
		assert.equal(pacificOffset(t), Math.round((wall - t) / 3_600_000), new Date(t).toISOString());
	}
	assert.equal(pacificOffset(Date.parse("2026-03-08T09:59:00Z")), -8, "a minute before 02:00 PST on the 2nd Sunday of March");
	assert.equal(pacificOffset(Date.parse("2026-03-08T10:00:00Z")), -7);
	assert.equal(pacificOffset(Date.parse("2026-11-01T08:59:00Z")), -7, "a minute before 02:00 PDT on the 1st Sunday of November");
	assert.equal(pacificOffset(Date.parse("2026-11-01T09:00:00Z")), -8);
});

test("peak windows are weekdays 05:00–11:00 in Los Angeles", () => {
	const windows = peakWindows(Date.UTC(2026, 0, 1), Date.UTC(2027, 0, 1));
	assert.equal(windows.length, 261, "every weekday of 2026");
	for (const w of windows) {
		const [a, b] = [inLA(w.start), inLA(w.end)];
		assert.ok(!["Sat", "Sun"].includes(a.weekday), a.weekday);
		assert.equal(`${a.hour}:${a.minute}–${b.hour}:${b.minute}`, "05:00–11:00");
		assert.equal(a.day, b.day);
	}
});

test("whether it is peak now, and when it ends or starts", () => {
	// Tuesday 20 October 2026, Pacific daylight time: 12:00–18:00 UTC
	assert.deepEqual(peakAt(Date.parse("2026-10-20T17:40:00Z")), { peak: true, start: Date.parse("2026-10-20T12:00:00Z"), end: Date.parse("2026-10-20T18:00:00Z") });
	assert.deepEqual(peakAt(Date.parse("2026-10-20T18:00:00Z")), { peak: false, start: Date.parse("2026-10-21T12:00:00Z"), end: Date.parse("2026-10-21T18:00:00Z") }, "the end is off-peak");
	assert.equal(peakAt(Date.parse("2026-10-20T11:59:00Z")).peak, false);
	// Friday evening to Monday
	assert.equal(peakAt(Date.parse("2026-10-23T20:00:00Z")).start, Date.parse("2026-10-26T12:00:00Z"));
	// after the US clocks go back on 1 November 2026: 13:00–19:00 UTC
	assert.deepEqual(peakAt(Date.parse("2026-11-02T00:00:00Z")), { peak: false, start: Date.parse("2026-11-02T13:00:00Z"), end: Date.parse("2026-11-02T19:00:00Z") });
	// and forward on 8 March 2026
	assert.equal(peakAt(Date.parse("2026-03-07T00:00:00Z")).start, Date.parse("2026-03-09T12:00:00Z"));
	// a range that starts inside a window still includes it
	assert.deepEqual(peakWindows(Date.parse("2026-10-20T15:00:00Z"), Date.parse("2026-10-20T16:00:00Z")), [{ start: Date.parse("2026-10-20T12:00:00Z"), end: Date.parse("2026-10-20T18:00:00Z") }]);
});
