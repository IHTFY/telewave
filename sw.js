/* Telewave service worker.
   Offline: every app file is precached on install, and Google Fonts are cached too.
   Freshness: same-origin files are fetched network-first (cache is only the offline
   fallback), so a stale copy is never served while online. A changed sw.js installs
   as a waiting worker and the page offers a reload (see the script in index.html).
   Bump VERSION when you change the precache list; old caches are deleted on activate. */
const VERSION = 'v1';
const APP = `telewave-app-${VERSION}`;
const FONTS = 'telewave-fonts';
const NETWORK_TIMEOUT = 4000;

const PRECACHE = [
	'./',
	'index.html',
	'styles/styles.css?v=2.1',
	'scripts/seedrandom.js',
	'scripts/data.js',
	'scripts/board.js',
	'manifest.webmanifest',
	'icons/icon.svg',
	'icons/icon-192.png',
	'icons/icon-512.png',
	'icons/maskable-512.png',
	'icons/apple-touch-icon.png',
	'icons/favicon-32.png'
];
const FONT_CSS = 'https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&family=Karla:wght@400;600;700&display=swap';

self.addEventListener('install', event => {
	event.waitUntil((async () => {
		const app = await caches.open(APP);
		// cache: 'reload' bypasses the HTTP cache so we never precache stale files
		await Promise.all(PRECACHE.map(async url => {
			const res = await fetch(new Request(url, { cache: 'reload' }));
			if (!res.ok) throw new Error(`precache failed: ${url}`);
			await app.put(url, res);
		}));
		// Fonts are best-effort: the game still works offline with fallback fonts.
		try {
			const fonts = await caches.open(FONTS);
			const cssRes = await fetch(FONT_CSS);
			const css = await cssRes.clone().text();
			await fonts.put(FONT_CSS, cssRes);
			const urls = [...css.matchAll(/url\((https:[^)]+)\)/g)].map(m => m[1]);
			await Promise.all(urls.map(u => fonts.add(u)));
		} catch (e) { /* offline during install or blocked */ }
		// No skipWaiting here: the page asks for it so an update never swaps files mid-game.
	})());
});

self.addEventListener('activate', event => {
	event.waitUntil((async () => {
		const keep = new Set([APP, FONTS]);
		for (const key of await caches.keys()) if (!keep.has(key)) await caches.delete(key);
		await self.clients.claim();
	})());
});

self.addEventListener('message', event => {
	if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
	const req = event.request;
	if (req.method !== 'GET') return;
	const url = new URL(req.url);

	if (url.origin === location.origin) {
		event.respondWith(networkFirst(req, url));
	} else if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
		event.respondWith(staleWhileRevalidate(req));
	}
	// anything else (ads, analytics) goes straight to the network
});

async function networkFirst(req, url) {
	const cache = await caches.open(APP);
	// Shared links carry ?shuffle=...&card=...; they all map to the one cached page.
	const key = req.mode === 'navigate' ? 'index.html' : req;
	try {
		const res = await Promise.race([
			fetch(req, { cache: 'no-cache' }),
			new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), NETWORK_TIMEOUT))
		]);
		if (res.ok) cache.put(key, res.clone());
		return res;
	} catch (e) {
		const hit = await cache.match(key, { ignoreSearch: req.mode === 'navigate' });
		if (hit) return hit;
		throw e;
	}
}

async function staleWhileRevalidate(req) {
	const cache = await caches.open(FONTS);
	const hit = await cache.match(req);
	const refresh = fetch(req).then(res => { if (res.ok) cache.put(req, res.clone()); return res; });
	if (hit) { refresh.catch(() => {}); return hit; }
	return refresh;
}
