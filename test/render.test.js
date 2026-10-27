import assert from "node:assert/strict";
import { test } from "node:test";
import { fiveHourAction } from "../src/actions/limits.js";
import { renderDual } from "../src/render/dual.js";
import { PERCENT_STYLES, renderPercent } from "../src/render/percent.js";

const H = 3_600_000;
const now = Date.parse("2026-10-28T12:00:00Z");
const view = { label: "5-HOUR", used: 25, show: "left", resetsAt: now + 2 * H, now, windowMs: 5 * H, warn: 50, danger: 80, series: [] };
const visible = (svg) => [...svg.matchAll(/<text[^>]*>(.*?)<\/text>/g)].map((m) => m[1].replace(/<[^>]+>/g, ""));

test("numbers that are no longer current are dimmed and say why, in every style", () => {
	for (const { id } of PERCENT_STYLES) {
		const svg = renderPercent(id, { ...view, stale: true, old: "login expired" });
		assert.match(svg, /<g opacity="0.35">/, id);
		assert.equal(visible(svg).at(-1), "login expired", id);
		assert.ok(!renderPercent(id, view).includes("opacity"), `${id}: current numbers are not dimmed`);
	}
	const dual = renderDual("bars", { five: { used: 25, resetsAt: now + 2 * H }, week: { used: 52, resetsAt: now + 50 * H }, show: "left", warn: 50, danger: 80, now, old: "3h old" });
	assert.match(dual, /<g opacity="0.35">/);
	assert.equal(visible(dual).at(-1), "3h old");
});

test("a limit key says when its numbers are old, and why", () => {
	const settings = fiveHourAction.normalize({});
	const service = (fetchedAt, error = null) => ({
		data: { fiveHour: { used: 25, resetsAt: now + 2 * H } },
		error,
		fetchedAt,
		stale: () => now - fetchedAt > 5 * 60_000,
		window: () => ({ used: 25, resetsAt: now + 2 * H, reset: false }),
		series: () => [],
	});
	const keyOf = (svc) => visible(fiveHourAction.render({ settings, limits: svc, now: new Date(now) }));

	assert.equal(keyOf(service(now - 60_000)).at(-1), "2h00m", "current: the time until the reset");
	assert.equal(keyOf(service(now - 3 * H, { code: "expired", message: "" })).at(-1), "login expired", "a login problem shows at once");
	assert.equal(keyOf(service(now - 2 * 60_000, { code: "network", message: "" })).at(-1), "2h00m", "a short network blip does not");
	assert.equal(keyOf(service(now - 3 * H, { code: "network", message: "" })).at(-1), "3h old", "but hours of it do");
	assert.equal(keyOf(service(now - 40 * 60_000)).at(-1), "40m old", "so do numbers that stopped updating without an error");
});
