// Stream Deck connection through Elgato's official SDK (@elgato/streamdeck), which Marketplace's DRM
// requires. The plugin core addresses keys by their context id: this adapter turns SDK events into
// { action, context, payload } messages and finds the SDK's action object for each command.
import { EventEmitter } from "node:events";
import streamDeck from "@elgato/streamdeck";

export function connectStreamDeck(log) {
	const events = new EventEmitter();
	const emit = (name, message) => {
		try {
			events.emit(name, message);
		} catch (err) {
			log.error(`${name} handler failed: ${err?.stack ?? err}`);
		}
	};
	const message = (ev) => ({ action: ev.action.manifestId, context: ev.action.id, payload: ev.payload });

	// The SDK's newer settings events need Stream Deck 7.1; the plugin never calls getSettings(), where
	// the two behaviours differ, so the older one lets it run from Stream Deck 6.9 as DRM requires.
	streamDeck.settings.useLegacySettingsBehavior = true;

	streamDeck.actions.onWillAppear((ev) => emit("willAppear", message(ev)));
	streamDeck.actions.onWillDisappear((ev) => emit("willDisappear", message(ev)));
	streamDeck.actions.onKeyDown((ev) => emit("keyDown", message(ev)));
	streamDeck.actions.onKeyUp((ev) => emit("keyUp", message(ev)));
	streamDeck.settings.onDidReceiveSettings((ev) => emit("didReceiveSettings", message(ev)));
	streamDeck.ui.onDidAppear((ev) => emit("propertyInspectorDidAppear", message(ev)));
	streamDeck.ui.onDidDisappear((ev) => emit("propertyInspectorDidDisappear", message(ev)));
	streamDeck.ui.onSendToPlugin((ev) => emit("sendToPlugin", message(ev)));
	streamDeck.system.onSystemDidWakeUp(() => emit("systemDidWakeUp", {}));

	streamDeck.connect().then(
		() => log.info("connected to Stream Deck"),
		(err) => log.error(`cannot connect to Stream Deck: ${err?.stack ?? err}`),
	);

	const keyOf = (context) => {
		const action = streamDeck.actions.getActionById(context);
		return action?.isKey() ? action : undefined;
	};
	// commands to a key that has just gone away fail; that is not worth more than a log line
	const quietly = (what, promise) => promise?.catch((err) => log.warn(`${what}: ${err?.message ?? err}`));

	return {
		on: (name, handler) => events.on(name, handler),
		setImage: (context, image) => quietly("setImage", keyOf(context)?.setImage(image)),
		setSettings: (context, settings) => quietly("setSettings", keyOf(context)?.setSettings(settings)),
		showOk: (context) => quietly("showOk", keyOf(context)?.showOk()),
		showAlert: (context) => quietly("showAlert", keyOf(context)?.showAlert()),
		openUrl: (url) => quietly("openUrl", streamDeck.system.openUrl(url)),
		// the SDK talks to the settings panel that is open, so only send when it is this key's
		sendToPropertyInspector: (context, _action, payload) => {
			if (streamDeck.ui.action?.id === context) quietly("sendToPropertyInspector", streamDeck.ui.sendToPropertyInspector(payload));
		},
	};
}
