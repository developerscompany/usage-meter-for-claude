// The plugin icon, shared by the plugin's images and the Marketplace listing.
// A usage ring with token bars inside; no text and no third-party logos, as Marketplace asks.
export const pluginIcon = (size) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 256 256">
	<rect width="256" height="256" rx="56" fill="#0b0b0c"/>
	<circle cx="128" cy="128" r="80" fill="none" stroke="#2c2c2e" stroke-width="26"/>
	<path d="M128 48 A80 80 0 1 1 51.9 152.7" fill="none" stroke="#30d158" stroke-width="26" stroke-linecap="round"/>
	<rect x="92" y="128" width="18" height="34" rx="4" fill="#30d158" fill-opacity="0.55"/>
	<rect x="119" y="110" width="18" height="52" rx="4" fill="#30d158" fill-opacity="0.8"/>
	<rect x="146" y="90" width="18" height="72" rx="4" fill="#30d158"/>
</svg>`;
