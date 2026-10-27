import fs from "node:fs";
import path from "node:path";

const MAX_SIZE = 1 << 20;

/** Appends to <dir>/plugin.log, keeping one rotated copy. Never throws. */
export function createLogger(dir) {
	let file = null;
	try {
		fs.mkdirSync(dir, { recursive: true });
		file = path.join(dir, "plugin.log");
	} catch {
		// read-only plugin folder: logging is best effort
	}

	const write = (level, message) => {
		if (!file) return;
		try {
			const st = fs.statSync(file, { throwIfNoEntry: false });
			if (st && st.size > MAX_SIZE) fs.renameSync(file, `${file}.1`);
			fs.appendFileSync(file, `${new Date().toISOString()} ${level} ${message}\n`);
		} catch {
			// ignore
		}
	};

	return {
		info: (message) => write("INFO", message),
		warn: (message) => write("WARN", message),
		error: (message) => write("ERROR", message),
	};
}
