// Property inspector shared by all keys: the form is built from SCHEMAS for the key's action,
// and the plugin sends the current numbers plus a live preview of every display style.
const REFRESH = [
	[30, "Every 30 seconds"],
	[60, "Every minute"],
	[120, "Every 2 minutes"],
	[300, "Every 5 minutes"],
];
const THRESHOLDS = [20, 30, 40, 50, 60, 70, 80, 90, 95].map((v) => [v, `${v}% used`]);
const PERIODS = [
	["today", "Today"],
	["week", "Week"],
	["month", "Month"],
];

// How to show a second Claude account, per platform; folded under the account picker.
const ADD_ACCOUNT = {
	title: "How to add another Claude account",
	mac: [
		"Each Claude account needs its own Claude Code profile folder.",
		"1. In Terminal, run:",
		{ code: "CLAUDE_CONFIG_DIR=~/.claude-work claude" },
		"2. Sign in with the other account when Claude Code asks (or type /login).",
		"3. Choose ~/.claude-work under Account. It shows up by itself, with its email.",
		"Give each key its own Tag, such as W. The login stays fresh while you use Claude Code with that profile; a Launch Claude Code key set to the same account opens it in one press.",
	],
	windows: [
		"Each Claude account needs its own Claude Code profile folder.",
		"1. In Command Prompt, run:",
		{ code: 'set "CLAUDE_CONFIG_DIR=%USERPROFILE%\\.claude-work" && claude' },
		"2. Sign in with the other account when Claude Code asks (or type /login).",
		"3. Choose ~/.claude-work under Account. It shows up by itself, with its email.",
		"Give each key its own Tag, such as W. The login stays fresh while you use Claude Code with that profile; a Launch Claude Code key set to the same account opens it in one press.",
	],
};

const F = {
	periods: { key: "periods", label: "Periods", type: "checks", options: PERIODS },
	week: { key: "weekMode", label: "Week", type: "select", options: [["rolling", "Last 7 days"], ["calendar", "This week (from Monday)"]] },
	month: { key: "monthMode", label: "Month", type: "select", options: [["calendar", "This month (from the 1st)"], ["rolling", "Last 30 days"]] },
	refresh: { key: "refresh", label: "Refresh", type: "select", options: REFRESH, number: true },
	folders: { key: "paths", label: "Log folders", type: "textarea", placeholder: "Auto: ~/.claude/projects and other ~/.claude-* profiles", hint: "One folder per line. Leave empty to find them automatically." },
	show: { key: "show", label: "Show", type: "select", options: [["left", "What's left"], ["used", "What's used"]] },
	press: { key: "press", label: "On press", type: "select", options: [["toggle", "Switch left / used"], ["style", "Next display style"], ["refresh", "Refresh"], ["open", "Open claude.ai usage page"]] },
	account: {
		key: "account",
		label: "Account",
		type: "account",
		hint: "Whose limits to show. Auto takes the freshest Claude Code login on this computer; to see two accounts, set each key to its own.",
		guide: ADD_ACCOUNT,
	},
	tag: { key: "tag", label: "Tag", type: "text", placeholder: "Optional, e.g. N", maxlength: 3, hint: "Short marker in the corner, handy with two accounts." },
	warn: { key: "warn", label: "Yellow from", type: "select", options: THRESHOLDS, number: true },
	danger: { key: "danger", label: "Red from", type: "select", options: THRESHOLDS, number: true },
};

const LIMIT_FIELDS = [F.show, F.press, F.account, F.tag, F.warn, F.danger, F.refresh];

// Help links under each key's settings, opened in the browser; support is added to every key.
const HELP = {
	usage: ["Claude usage page", "https://claude.ai/settings/usage"],
	code: ["Claude Code setup", "https://code.claude.com/docs/en/setup"],
	adminKeys: ["Create an Admin key", "https://platform.claude.com/settings/admin-keys"],
	billing: ["Console billing", "https://platform.claude.com/settings/billing"],
	status: ["Claude status", "https://status.claude.com"],
	support: ["Email support", "mailto:elgato@rivo.agency"],
};
const LIMIT_LINKS = [HELP.usage, HELP.code];

const SCHEMAS = {
	usage: {
		fields: [F.periods, F.week, F.month, { key: "count", label: "Count", type: "select", options: [["all", "All tokens (input + output + cache)"], ["no-cache-read", "All except cache reads"], ["io", "Input + output only"]] }, F.refresh, F.folders],
		hint: "Press the key to switch period, hold it to rescan.",
		links: [HELP.code],
	},
	cost: {
		fields: [F.periods, F.week, F.month, F.refresh, F.folders],
		hint: "What your Claude Code usage would cost at Anthropic API list prices. Press: next period. Hold: rescan.",
		links: [HELP.code],
	},
	limit5h: { fields: LIMIT_FIELDS, hint: "Hold the key to refresh now.", links: LIMIT_LINKS },
	limit7d: {
		fields: [{ key: "scope", label: "Limit", type: "select", options: [["all", "All models"], ["fable", "Fable only"], ["opus", "Opus only"], ["sonnet", "Sonnet only"], ["haiku", "Haiku only"]] }, ...LIMIT_FIELDS],
		hint: "Hold the key to refresh now.",
		links: LIMIT_LINKS,
	},
	limits: { fields: LIMIT_FIELDS, hint: "5-hour and weekly limits on one key. Hold to refresh now.", links: LIMIT_LINKS },
	extra: { fields: LIMIT_FIELDS, hint: "Extra usage you buy on top of the plan, this month.", links: LIMIT_LINKS },
	credit: {
		fields: [
			{ key: "which", label: "Credit", type: "select", options: [["cloud", "Cloud session credit ($)"], ["code", "Claude Code and Cowork credit (%)"]] },
			...LIMIT_FIELDS,
		],
		hint: "Money left on the cloud session credit of your Claude plan, e.g. $186 of $250, and when it expires. It pays for Claude Code cloud sessions. While Anthropic's API does not send it, the key says so and opens claude.ai on press.",
		links: LIMIT_LINKS,
	},
	apicredit: {
		fields: [
			{ key: "amount", label: "Credit ($)", type: "text", number: true, placeholder: "200", pattern: "^\\d+(\\.\\d{1,2})?$", invalid: "A number of dollars, e.g. 200 or 199.50.", hint: "Amount granted, from the Billing page. 0 or empty: show this month's API spend instead." },
			{ key: "granted", label: "Granted on", type: "text", placeholder: "2026-10-18", pattern: "^\\d{4}-\\d{2}-\\d{2}$", invalid: "Use YYYY-MM-DD, e.g. 2026-10-18.", hint: "YYYY-MM-DD, in UTC as on the Billing page." },
			{ key: "expires", label: "Expires on", type: "text", placeholder: "2026-11-01", pattern: "^\\d{4}-\\d{2}-\\d{2}$", invalid: "Use YYYY-MM-DD, e.g. 2026-10-18." },
			F.show,
			{ key: "press", label: "On press", type: "select", options: [["toggle", "Switch left / spent"], ["style", "Next display style"], ["refresh", "Refresh"], ["open", "Open Console billing"]] },
			F.tag,
			F.warn,
			F.danger,
			{ key: "refresh", label: "Refresh", type: "select", options: [[60, "Every minute"], [300, "Every 5 minutes"], [900, "Every 15 minutes"]], number: true },
		],
		hint: "A Claude Console credit, such as promotional API credit: what is left after your API spend. Needs an Admin API key, see below.",
		links: [HELP.adminKeys, HELP.billing],
	},
	models: {
		fields: [
			F.periods,
			F.week,
			F.month,
			{ key: "metric", label: "Share of", type: "select", options: [["tokens", "Tokens"], ["cost", "API cost"]] },
			{ key: "group", label: "Group by", type: "select", options: [["family", "Family (Opus, Sonnet, …)"], ["model", "Model version"]] },
			F.refresh,
			F.folders,
		],
		hint: "Press: next period.",
		links: [HELP.code],
	},
	context: {
		fields: [
			{ key: "window", label: "Context size", type: "select", options: [["auto", "Auto (from the model)"], ["200000", "200K"], ["1000000", "1M"]] },
			F.warn,
			F.danger,
			{ key: "refresh", label: "Refresh", type: "select", options: [[5, "Every 5 seconds"], [15, "Every 15 seconds"], [30, "Every 30 seconds"], [60, "Every minute"]], number: true },
			F.folders,
		],
		hint: "Context of your latest Claude Code sessions. Press: next session.",
		links: [HELP.code],
	},
	peak: {
		fields: [
			{ key: "warn", label: "Warn before", type: "select", options: [[0, "Off"], [15, "15 minutes"], [30, "30 minutes"], [60, "1 hour"], [120, "2 hours"]], number: true },
			{ key: "clock", label: "Clock", type: "select", options: [["auto", "Auto (as this computer)"], ["24", "24-hour"], ["12", "12-hour (AM/PM)"]] },
			F.tag,
		],
		hint: "Weekdays 5–11 AM Pacific time, shown in your time. Press: next style.",
	},
	cache: {
		fields: [F.periods, F.week, F.month, F.refresh, F.folders],
		hint: "Share of Claude Code's input read from the prompt cache, and what those reads saved at API list prices. Press: next period.",
		links: [HELP.code],
	},
	streak: {
		fields: [{ key: "refresh", label: "Refresh", type: "select", options: [[60, "Every minute"], [300, "Every 5 minutes"], [900, "Every 15 minutes"]], number: true }, F.folders],
		hint: "Days in a row with Claude Code on this computer; the last 40 days are kept. Green: today counts, orange: not yet today. Press: next style.",
		links: [HELP.code],
	},
	launch: {
		fields: [
			{ key: "folder", label: "Folder", type: "text", placeholder: "~", hint: "Where to start, e.g. ~/projects/app" },
			{ key: "command", label: "Command", type: "text", placeholder: "claude", hint: "What to run there, e.g. claude --continue" },
			{ ...F.account, hint: "Which Claude account Claude Code opens with." },
			{ key: "terminal", label: "Terminal", type: "select", options: [["terminal", "Terminal", "mac"], ["iterm", "iTerm", "mac"], ["cmd", "Command Prompt", "windows"], ["wt", "Windows Terminal", "windows"]] },
			F.tag,
		],
		hint: "Press to open a terminal window running Claude Code. Sending it a message also renews that account's login, which the limit keys read.",
		links: [HELP.code],
	},
	status: {
		fields: [
			{
				key: "component",
				label: "Watch",
				type: "select",
				options: [
					["all", "Everything"],
					["code", "Claude Code"],
					["app", "claude.ai"],
					["api", "Claude API"],
					["console", "Claude Console"],
					["cowork", "Claude Cowork"],
					["fable", "Fable models"],
					["opus", "Opus models"],
					["sonnet", "Sonnet models"],
					["haiku", "Haiku models"],
				],
			},
			{ key: "refresh", label: "Refresh", type: "select", options: [[60, "Every minute"], [120, "Every 2 minutes"], [300, "Every 5 minutes"]], number: true },
		],
		hint: "From status.claude.com. When something is wrong, the key names the model in trouble (such as Fable 5) or the service. Press it to open the incident.",
		links: [HELP.status],
	},
};

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

let socket = null;
let platform = ""; // "mac" or "windows", from Stream Deck
let uuid = "";
let action = "";
let schema = null;
let settings = {};
let accounts = [{ value: "", label: "Auto (freshest login)" }];

function save() {
	if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ event: "setSettings", context: uuid, payload: settings }));
}

function openUrl(url) {
	if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ event: "openUrl", payload: { url } }));
}

// options can name the one platform they apply to
const optionsFor = (field) => field.options.filter(([, , os]) => !os || !platform || os === platform);

function toPlugin(payload) {
	if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ action, event: "sendToPlugin", context: uuid, payload }));
}

function control(field) {
	const id = `f-${field.key}`;
	if (field.type === "checks") {
		return `<div class="checks">${field.options.map(([v, l]) => `<label><input type="checkbox" data-key="${field.key}" value="${v}"> ${esc(l)}</label>`).join("")}</div>`;
	}
	if (field.type === "select") {
		return `<select id="${id}" data-key="${field.key}">${optionsFor(field).map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join("")}</select>`;
	}
	if (field.type === "textarea") return `<textarea id="${id}" data-key="${field.key}" spellcheck="false" placeholder="${esc(field.placeholder)}"></textarea>`;
	if (field.type === "account") {
		return `<select id="${id}" data-key="account"></select><input id="f-account-other" type="text" spellcheck="false" placeholder="~/.claude-work" hidden>`;
	}
	return `<input id="${id}" data-key="${field.key}" type="text" spellcheck="false" maxlength="${field.maxlength ?? 200}" placeholder="${esc(field.placeholder)}">`;
}

/** Step-by-step help folded under a field; commands can be selected and copied. */
function guideOf(field) {
	if (!field.guide) return "";
	const steps = field.guide[platform] ?? field.guide.mac;
	const body = steps.map((step) => (typeof step === "string" ? `<p>${esc(step)}</p>` : `<code title="Click to copy">${esc(step.code)}</code>`)).join("");
	return `<details class="guide"><summary>${esc(field.guide.title)}</summary>${body}</details>`;
}

function buildForm() {
	$("fields").innerHTML = schema.fields
		.map((field) => {
			const error = field.pattern ? `<div class="warn" id="f-${field.key}-error" hidden>${esc(field.invalid)}</div>` : "";
			return `<div class="item${field.type === "textarea" || field.type === "account" ? " top" : ""}"><div class="label">${esc(field.label)}</div><div>${control(field)}${error}${field.hint ? `<div class="hint">${esc(field.hint)}</div>` : ""}${guideOf(field)}</div></div>`;
		})
		.join("");
	$("hint").textContent = schema.hint ?? "";
	$("links").innerHTML = [...(schema.links ?? []), HELP.support].map(([label, url]) => `<a href="#" data-url="${esc(url)}">${esc(label)}</a>`).join("");
	for (const link of document.querySelectorAll("#links a")) {
		link.addEventListener("click", (e) => {
			e.preventDefault();
			openUrl(link.dataset.url);
		});
	}

	for (const el of document.querySelectorAll("[data-key]")) {
		const field = schema.fields.find((f) => f.key === el.dataset.key);
		el.addEventListener("change", () => {
			if (field.type === "checks") {
				const values = [...document.querySelectorAll(`input[data-key="${field.key}"]:checked`)].map((c) => c.value);
				if (!values.length) {
					el.checked = true; // keep at least one
					return;
				}
				settings[field.key] = field.options.map(([v]) => v).filter((v) => values.includes(v));
				if (field.key === "periods") settings.periodIndex = 0;
			} else if (field.type === "account") {
				const other = el.value === "__other";
				$("f-account-other").hidden = !other;
				if (other) return $("f-account-other").focus();
				settings.account = el.value;
			} else {
				// a value that does not fit is shown as wrong and not saved
				const value = el.value.trim();
				if (field.pattern) {
					const wrong = value !== "" && !new RegExp(field.pattern).test(value);
					el.classList.toggle("invalid", wrong);
					$(`f-${field.key}-error`).hidden = !wrong;
					if (wrong) return;
				}
				settings[field.key] = field.number ? Number(value) : field.type === "select" ? el.value : value;
			}
			save();
		});
	}
	for (const code of document.querySelectorAll(".guide code")) {
		code.addEventListener("click", () => {
			window.getSelection().selectAllChildren(code);
			try {
				if (document.execCommand("copy")) code.classList.add("copied");
			} catch {
				// selected at least, ready for ⌘C / Ctrl+C
			}
		});
	}
	$("f-account-other")?.addEventListener("change", (e) => {
		settings.account = e.target.value.trim();
		save();
	});
}

function fill() {
	for (const field of schema.fields) {
		const value = settings[field.key];
		if (field.type === "checks") {
			for (const box of document.querySelectorAll(`input[data-key="${field.key}"]`)) box.checked = Array.isArray(value) && value.includes(box.value);
		} else if (field.type === "account") {
			const list = [...accounts];
			if (value && !list.some((a) => a.value === value)) list.push({ value, label: value });
			$("f-account").innerHTML = list.map((a) => `<option value="${esc(a.value)}">${esc(a.label)}</option>`).join("") + `<option value="__other">Other folder…</option>`;
			$("f-account").value = value ?? "";
		} else {
			const el = $(`f-${field.key}`);
			if (el && document.activeElement !== el && value !== undefined) el.value = String(value);
			if (el?.tagName === "SELECT" && el.selectedIndex < 0) el.selectedIndex = 0; // a value this platform has no option for
		}
	}
	for (const tile of document.querySelectorAll(".style")) tile.classList.toggle("selected", tile.dataset.style === settings.style);
}

function showPreviews(previews) {
	if (!previews?.length || previews.length < 2) {
		$("styles").hidden = true;
		return;
	}
	$("styles").hidden = false;
	$("style-grid").innerHTML = previews
		.map((p) => `<button class="style" data-style="${esc(p.id)}" title="${esc(p.label)}"><img src="${p.image}" alt=""><span>${esc(p.label)}</span></button>`)
		.join("");
	for (const tile of document.querySelectorAll(".style")) {
		tile.addEventListener("click", () => {
			settings.style = tile.dataset.style;
			save();
			fill();
		});
	}
}

function showDetails(status) {
	let html = "";
	if (status.table?.rows?.length) {
		const { columns, rows, highlight, caption } = status.table;
		html += caption ? `<div class="caption">${esc(caption)}</div>` : "";
		html += `<table><tr><th></th>${columns.map((c) => `<th>${esc(c)}</th>`).join("")}</tr>`;
		html += rows.map((row, i) => `<tr class="${i === highlight ? "hl" : ""}">${row.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("");
		html += "</table>";
	}
	for (const [label, value] of status.info ?? []) {
		html += `<div class="row"><span>${esc(label)}</span><span>${esc(value).replace(/\n/g, "<br>")}</span></div>`;
	}
	if (status.note) html += `<div class="hint">${esc(status.note)}</div>`;
	if (status.error) html += `<div class="warn">${esc(status.error)}</div>`;
	$("details").innerHTML = html || `<div class="hint">No data yet.</div>`;
}

// Called by Stream Deck when the property inspector opens.
function connectElgatoStreamDeckSocket(port, inUUID, registerEvent, info, actionInfo) {
	uuid = inUUID;
	try {
		platform = JSON.parse(info)?.application?.platform ?? "";
	} catch {
		platform = "";
	}
	const parsed = JSON.parse(actionInfo);
	action = parsed.action;
	schema = SCHEMAS[action.split(".").pop()] ?? { fields: [] };
	if (action.endsWith(".launch")) accounts = [{ value: "", label: "Default (~/.claude)" }];
	settings = { ...(parsed.payload?.settings ?? {}) };
	buildForm();
	fill();

	socket = new WebSocket(`ws://127.0.0.1:${port}`);
	socket.onopen = () => {
		socket.send(JSON.stringify({ event: registerEvent, uuid }));
		toPlugin({ cmd: "status" });
	};
	socket.onmessage = (e) => {
		const message = JSON.parse(e.data);
		if (message.event === "didReceiveSettings") {
			settings = { ...settings, ...(message.payload?.settings ?? {}) };
			fill();
		} else if (message.event === "sendToPropertyInspector" && message.payload?.type === "status") {
			const status = message.payload;
			settings = { ...settings, ...status.settings };
			if (status.accounts) accounts = status.accounts;
			showPreviews(status.previews);
			showDetails(status);
			fill();
		}
	};
}
window.connectElgatoStreamDeckSocket = connectElgatoStreamDeckSocket;

$("rescan").addEventListener("click", () => toPlugin({ cmd: "refresh" }));
