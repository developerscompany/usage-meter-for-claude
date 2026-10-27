// 24-hour or 12-hour (AM/PM) times: from a key's setting, else from the computer. The region decides,
// not the language: English on a Mac set to Ukraine still means a 24-hour clock, while Node's own
// guess says en-US (12-hour) whenever LANG is not set, as with apps started from the Dock.
import { execFile } from "node:child_process";

// Regions where the 12-hour clock with AM/PM is the norm.
const TWELVE_HOUR_REGIONS = new Set(["US", "CA", "AU", "NZ", "IN", "PK", "BD", "PH", "MY", "EG", "SA", "AE", "JO", "KR", "TW", "MX", "CO", "HN", "SV", "PA", "DO", "PR", "GU", "AS", "MP", "VI", "UM"]);
const TWELVE_HOUR_ZONES =
	/^(US|Canada|Australia)\/|^America\/(Indiana|Kentucky|North_Dakota)\/|^America\/(New_York|Chicago|Denver|Phoenix|Los_Angeles|Anchorage|Juneau|Sitka|Yakutat|Nome|Adak|Boise|Detroit|Menominee|Metlakatla|Toronto|Vancouver|Edmonton|Winnipeg|Halifax|St_Johns|Regina|Mexico_City|Bogota|Puerto_Rico)$|^Pacific\/(Honolulu|Auckland)$|^Asia\/(Kolkata|Calcutta|Karachi|Dhaka|Manila|Kuala_Lumpur|Riyadh|Dubai|Seoul|Taipei)$|^Africa\/Cairo$/;

/** true for a 12-hour clock, once the system has said so. */
let system = null;

const regionOf = (locale) => /[-_]([A-Za-z]{2})(?![A-Za-z])/.exec(String(locale ?? ""))?.[1]?.toUpperCase() ?? null;

/** Region of a macOS AppleLocale such as uk_UA, en_UA or en_US@rg=uazzzz (a region set apart from the language). */
function appleRegion(appleLocale) {
	const override = /@.*\brg=([a-z]{2})/i.exec(appleLocale ?? "")?.[1];
	return override ? override.toUpperCase() : regionOf(appleLocale);
}

function guess(env = process.env, platform = process.platform) {
	const region = regionOf(Intl.DateTimeFormat().resolvedOptions().locale);
	if (region && (env.LC_ALL || env.LC_TIME || env.LANG || platform === "win32")) return TWELVE_HOUR_REGIONS.has(region);
	return TWELVE_HOUR_ZONES.test(Intl.DateTimeFormat().resolvedOptions().timeZone ?? "");
}

/** Whether to show AM/PM: a key's "12" or "24", else what the computer uses. */
export function twelveHour(setting = "auto") {
	if (setting === "12") return true;
	if (setting === "24") return false;
	return system ?? guess();
}

const readDefault = (key) =>
	new Promise((resolve) => execFile("/usr/bin/defaults", ["read", "-g", key], { timeout: 5000 }, (err, out) => resolve(err ? null : String(out).trim())));

/** Asks macOS once: a 24- or 12-hour clock forced in System Settings, else the Mac's region. */
export async function detectClock({ platform = process.platform, read = readDefault, env = process.env } = {}) {
	if (platform !== "darwin") return (system = guess(env, platform));
	if ((await read("AppleICUForce24HourTime")) === "1") return (system = false);
	if ((await read("AppleICUForce12HourTime")) === "1") return (system = true);
	const region = appleRegion(await read("AppleLocale"));
	return (system = region ? TWELVE_HOUR_REGIONS.has(region) : guess(env, platform));
}

const pad = (n) => String(n).padStart(2, "0");

/** "15:00", or "3 PM" and "3:30 PM" on a 12-hour clock. */
export function clockTime(ms, twelve) {
	const d = new Date(ms);
	const [h, m] = [d.getHours(), d.getMinutes()];
	if (!twelve) return `${pad(h)}:${pad(m)}`;
	return `${h % 12 || 12}${m ? `:${pad(m)}` : ""} ${h < 12 ? "AM" : "PM"}`;
}

/** "15:00–21:00", or "5–11 AM" and "8 AM–2 PM" on a 12-hour clock. */
export function clockRange(from, to, twelve) {
	const [a, b] = [clockTime(from, twelve), clockTime(to, twelve)];
	if (!twelve) return `${a}–${b}`;
	const [aTime, aHalf] = a.split(" ");
	return aHalf === b.split(" ")[1] ? `${aTime}–${b}` : `${a}–${b}`;
}
