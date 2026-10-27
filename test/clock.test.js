import assert from "node:assert/strict";
import { test } from "node:test";
import { clockRange, clockTime, detectClock, twelveHour } from "../src/clock.js";

const at = (h, m = 0) => new Date(2026, 9, 20, h, m).getTime(); // local time

test("24-hour and AM/PM times, ranges kept short", () => {
	assert.equal(clockTime(at(15), false), "15:00");
	assert.equal(clockTime(at(9, 5), false), "09:05");
	assert.equal(clockTime(at(15), true), "3 PM");
	assert.equal(clockTime(at(0, 30), true), "12:30 AM");
	assert.equal(clockTime(at(12), true), "12 PM");
	assert.equal(clockRange(at(15), at(21), false), "15:00–21:00");
	assert.equal(clockRange(at(5), at(11), true), "5–11 AM");
	assert.equal(clockRange(at(8), at(14), true), "8 AM–2 PM");
	assert.equal(clockRange(at(17, 30), at(23, 30), true), "5:30–11:30 PM");
});

test("the Mac's region decides the clock, not its language", async () => {
	const mac = (values) => detectClock({ platform: "darwin", read: async (key) => values[key] ?? null });
	assert.equal(await mac({ AppleLocale: "en_UA" }), false, "English in Ukraine: 24 hours");
	assert.equal(await mac({ AppleLocale: "uk_UA" }), false);
	assert.equal(await mac({ AppleLocale: "en_US" }), true);
	assert.equal(await mac({ AppleLocale: "en_US@rg=uazzzz" }), false, "a region chosen apart from the language");
	assert.equal(await mac({ AppleLocale: "en_US", AppleICUForce24HourTime: "1" }), false, "24-hour time forced in System Settings");
	assert.equal(await mac({ AppleLocale: "uk_UA", AppleICUForce12HourTime: "1" }), true);
	assert.equal(twelveHour(), true, "the answer is kept for keys set to Auto");
	assert.equal(twelveHour("24"), false);
	assert.equal(await mac({ AppleLocale: "de_DE" }), false);
	assert.equal(twelveHour("12"), true, "a key's own choice wins");
	assert.equal(twelveHour("auto"), false);
});
