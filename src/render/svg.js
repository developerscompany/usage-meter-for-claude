// SVG building blocks for 144×144 key images. Stream Deck draws keys with Qt SVG (SVG Tiny),
// so only text/tspan, rect, circle, line, polyline and path (with arcs) are used: no filters or CSS.
export const SIZE = 144;
export const FONT = "Helvetica Neue,Helvetica,Arial,sans-serif";

export const COLORS = {
	bg: "#000000",
	white: "#ffffff",
	text: "#f2f2f7",
	gray: "#8e8e93",
	dim: "#48484a",
	track: "#2c2c2e",
	green: "#30d158",
	yellow: "#ffd60a",
	orange: "#ff9f0a",
	red: "#ff453a",
	blue: "#0a84ff",
	teal: "#64d2ff",
	purple: "#bf5af2",
};

export function esc(s) {
	return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}

const num = (v) => (Number.isInteger(v) ? String(v) : v.toFixed(2));

/**
 * @param {string} content already escaped text or <tspan> markup
 * @param {{ anchor?: string, weight?: string, opacity?: number, outline?: string }} [o]
 */
export function text(x, y, size, fill, content, { anchor = "middle", weight = "bold", opacity, outline } = {}) {
	const common = `x="${num(x)}" y="${num(y)}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}"`;
	const op = opacity === undefined ? "" : ` fill-opacity="${opacity}"`;
	// Qt has no paint-order, so an outline is a stroked copy underneath.
	const under = outline ? `<text ${common} fill="${outline}" stroke="${outline}" stroke-width="${Math.max(3, size / 6).toFixed(1)}" stroke-linejoin="round">${content}</text>` : "";
	return `${under}<text ${common} fill="${fill}"${op}>${content}</text>`;
}

/** Number with a smaller unit after it, e.g. 75 and %. */
export function valueWithUnit(x, y, size, fill, value, unit, { anchor = "middle", unitScale = 0.55, outline } = {}) {
	const unitPart = unit ? `<tspan font-size="${Math.round(size * unitScale)}">${esc(unit)}</tspan>` : "";
	return text(x, y, size, fill, `<tspan font-size="${size}">${esc(value)}</tspan>${unitPart}`, { anchor, outline });
}

// Rough advance widths (em) of a bold sans, to keep numbers inside the key.
export function emWidth(s) {
	let w = 0;
	for (const c of s) w += c === "." || c === "," || c === ":" ? 0.28 : c === "$" || c === "<" ? 0.58 : c === "M" || c === "K" || c === "B" ? 0.86 : 0.58;
	return w;
}

/** Estimated width in pixels of an upper-case label in a bold sans. */
export function labelWidth(label, size) {
	let em = 0;
	for (const c of String(label)) em += c === " " || c === "." ? 0.28 : c === "-" ? 0.36 : /[0-9]/.test(c) ? 0.58 : /[MW]/.test(c) ? 0.86 : 0.7;
	return em * size;
}

/** Estimated width in pixels of mixed-case text in a bold sans. */
export function textWidth(value, size) {
	let em = 0;
	for (const c of String(value)) {
		if (c === " " || c === "." || c === "/" || c === "·") em += 0.3;
		else if (/[0-9$~]/.test(c)) em += 0.58;
		else if (/[A-Z]/.test(c)) em += c === "M" || c === "W" ? 0.86 : 0.7;
		else em += c === "m" || c === "w" ? 0.86 : 0.56;
	}
	return em * size;
}

/** Largest font size (up to `max`) at which `value` + smaller `unit` fit into `width` pixels. */
export function fitSize(value, unit, width, max, unitScale = 0.55) {
	const em = emWidth(value) + emWidth(unit) * unitScale;
	return Math.max(10, Math.min(max, Math.floor(width / em)));
}

const rad = (deg) => (deg * Math.PI) / 180;
/** Point on a circle; angles in degrees clockwise from 12 o'clock. */
export function polar(cx, cy, r, deg) {
	return [cx + r * Math.sin(rad(deg)), cy - r * Math.cos(rad(deg))];
}

/** Open arc from `from` to `to` degrees (clockwise from 12 o'clock), as a path for stroking. */
export function arc(cx, cy, r, from, to, stroke, width, { cap = "round", opacity } = {}) {
	if (to - from >= 359.99) return `<circle cx="${num(cx)}" cy="${num(cy)}" r="${num(r)}" fill="none" stroke="${stroke}" stroke-width="${width}"${opacity ? ` stroke-opacity="${opacity}"` : ""}/>`;
	if (to - from <= 0) return "";
	const [x1, y1] = polar(cx, cy, r, from);
	const [x2, y2] = polar(cx, cy, r, to);
	const large = to - from > 180 ? 1 : 0;
	return `<path d="M${num(x1)} ${num(y1)} A${num(r)} ${num(r)} 0 ${large} 1 ${num(x2)} ${num(y2)}" fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linecap="${cap}"${opacity ? ` stroke-opacity="${opacity}"` : ""}/>`;
}

/** Filled pie slice. */
export function slice(cx, cy, r, from, to, fill) {
	if (to - from >= 359.99) return `<circle cx="${num(cx)}" cy="${num(cy)}" r="${num(r)}" fill="${fill}"/>`;
	if (to - from <= 0) return "";
	const [x1, y1] = polar(cx, cy, r, from);
	const [x2, y2] = polar(cx, cy, r, to);
	const large = to - from > 180 ? 1 : 0;
	return `<path d="M${num(cx)} ${num(cy)} L${num(x1)} ${num(y1)} A${num(r)} ${num(r)} 0 ${large} 1 ${num(x2)} ${num(y2)} Z" fill="${fill}"/>`;
}

export function rect(x, y, w, h, fill, { rx = 0, opacity, stroke, strokeWidth } = {}) {
	if (w <= 0 || h <= 0) return "";
	const extra = `${rx ? ` rx="${num(rx)}"` : ""}${opacity !== undefined ? ` fill-opacity="${opacity}"` : ""}${stroke ? ` stroke="${stroke}" stroke-width="${strokeWidth ?? 1}"` : ""}`;
	return `<rect x="${num(x)}" y="${num(y)}" width="${num(w)}" height="${num(h)}" fill="${fill}"${extra}/>`;
}

/** Rounded progress bar: track plus a fill of `fraction` (0..1). */
export function bar(x, y, w, h, fraction, color, track = COLORS.track) {
	const f = Math.max(0, Math.min(1, fraction));
	const fillW = f > 0 ? Math.max(h, w * f) : 0;
	return rect(x, y, w, h, track, { rx: h / 2 }) + rect(x, y, Math.min(w, fillW), h, color, { rx: h / 2 });
}

/** Header line at the top of every key; `tag` is a short marker in the corner (e.g. an account letter). */
export function header(label, { tag, stale } = {}) {
	let out = text(72, 24, 17, COLORS.white, esc(label));
	if (tag) out += text(136, 20, 12, COLORS.gray, esc(tag), { anchor: "end" });
	if (stale) out += `<circle cx="11" cy="15" r="3.5" fill="none" stroke="${COLORS.gray}" stroke-width="1.5"/>`;
	return out;
}

/**
 * Numbers that are no longer current: dimmed, with what is wrong ("login expired", "3h old") across the
 * bottom in orange, so nobody takes them for today's.
 */
export function oldNumbers(parts, note) {
	const size = textWidth(note, 14) <= 136 ? 14 : 12;
	return [`<g opacity="0.35">${parts.join("")}</g>`, `<rect x="0" y="121" width="${SIZE}" height="23" fill="${COLORS.bg}"/>`, text(72, 138, size, COLORS.orange, esc(note))];
}

export function svg(parts) {
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}"><rect width="${SIZE}" height="${SIZE}" fill="${COLORS.bg}"/>${parts.join("")}</svg>`;
}

export function toDataUrl(svgText) {
	return `data:image/svg+xml;base64,${Buffer.from(svgText, "utf8").toString("base64")}`;
}

/** Colour for a percentage used, by the key's warning thresholds. */
export function levelColor(used, warn = 50, danger = 80) {
	if (used >= danger) return COLORS.red;
	if (used >= warn) return COLORS.yellow;
	return COLORS.green;
}

/** Key for "loading", "no data" and error states. */
export function messageKey(label, message, { big = "···", color = COLORS.gray, tag, messageColor = COLORS.orange, detail = "" } = {}) {
	return svg([
		header(label, { tag }),
		text(72, 82, 42, color, esc(big)),
		text(72, 108, 13, messageColor, esc(message)),
		detail ? text(72, 126, 12, COLORS.gray, esc(detail)) : "",
	]);
}
