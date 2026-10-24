// Run with: node --test
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');

// Just enough DOM for the ad code in scripts/board.js: elements by id, attached or not.
class FakeElement {
	constructor(id) {
		this.id = id; this.isConnected = true; this.hidden = true; this.listeners = {}; this.dataset = {};
		this.classes = new Set();
		this.classList = { add: name => this.classes.add(name), remove: name => this.classes.delete(name) };
	}
	addEventListener(name, callback) { this.listeners[name] = callback; }
	remove() { this.isConnected = false; }
}

// `adWidth` is the width the stylesheet gives the box beside the game: 0 where it is hidden.
function harness({ onLine = true, storage = {}, cookie = '', adWidth = 0, adFreeClass = false, innerHeight = 640, boxTop = 232 } = {}) {
	const added = [];
	const shown = [];
	const layout = { adWidth, adLeft: 1500, clientWidth: 1920, resized: () => {} };
	// Boxes swap themselves out for an empty copy, as winAd.hide() and a new play ad do.
	const box = id => Object.defineProperties(new FakeElement(id), {
		offsetWidth: { get: () => (id === 'playAdBox' ? layout.adWidth : 0) },
		cloneNode: { value: () => box(id) },
		getBoundingClientRect: { value: () => ({ top: boxTop }) },
		replaceWith: { value(fresh) { this.isConnected = false; els[id] = fresh; } }
	});
	const winScreen = Object.assign(new FakeElement('winScreen'), { parentElement: new FakeElement('wrap') });
	const els = { winScreen, winText: new FakeElement('winText'), playAgain: Object.assign(new FakeElement('playAgain'), { focus() {} }), winAd: new FakeElement('winAd'), winAdBox: box('winAdBox'), playAd: new FakeElement('playAd'), playAdBox: box('playAdBox') };
	els.playAd.getBoundingClientRect = () => ({ left: layout.adLeft });
	const style = new Map();
	const clock = { now: 0 };
	const scrolls = [];
	const window = { innerHeight, scrollTo: (x, y) => scrolls.push([x, y]), ihtfyAds: { show: (box, key) => shown.push([box, key]), adFree: async () => true } };
	// The class the <head> script sets; `onRemove` stands in for the stylesheet showing the ad again.
	const classes = new Set(adFreeClass ? ['ad-free'] : []);
	const classList = { contains: name => classes.has(name), remove: name => { classes.delete(name); classList.onRemove?.(); } };
	const events = new EventTarget();
	const context = vm.createContext({
		window,
		navigator: { onLine },
		localStorage: { getItem: key => storage[key] ?? null },
		Date: { now: () => clock.now },
		addEventListener: events.addEventListener.bind(events),
		ResizeObserver: class { constructor(callback) { layout.resized = callback; } observe() { layout.resized(); } },
		document: {
			cookie,
			documentElement: {
				get clientWidth() { return layout.clientWidth; },
				classList,
				style: { setProperty: (name, value) => style.set(name, value), removeProperty: name => style.delete(name) }
			},
			getElementById: id => els[id],
			createElement: () => new FakeElement(),
			head: { appendChild: el => { added.push(el); } }
		}
	});
	// The ad code sits at the top of board.js, ahead of the board itself.
	const board = readFileSync(join(__dirname, '../scripts/board.js'), 'utf8');
	const end = board.indexOf('\n// ---------- board ----------');
	assert.ok(end > 0, 'board.js lost its ad section marker');
	vm.runInContext(`${board.slice(0, end)}\nwindow.winAd = winAd;\nwindow.results = results;\nwindow.playAd = playAd;`, context);
	const input = type => events.dispatchEvent(new Event(type));
	return { scrolls, ads: window.winAd, results: window.results, playAd: window.playAd, els, added, shown, context, layout, style, clock, input, classes, classList, window };
}
const settle = () => new Promise(resolve => setImmediate(resolve));

test('a win shows the slot and loads the shared loader once, keyed by the game over', async () => {
	const h = harness();
	const box = h.els.winAdBox;
	h.ads.show('seed/12');
	h.ads.show('seed/12');
	assert.equal(h.els.winAd.hidden, false);
	assert.equal(h.added.length, 1);
	assert.equal(h.added[0].src, 'https://ihtfy.com/ads/v1.js');
	h.added[0].listeners.load();
	await settle();
	assert.deepEqual(h.shown, [[box, 'seed/12'], [box, 'seed/12']]);
});

test('nothing loads until a win', () => {
	const h = harness();
	h.ads.hide();
	assert.equal(h.els.winAd.hidden, true);
	assert.equal(h.added.length, 0);
});

test('nothing loads at startup for a visitor without an ad-free token', () => {
	const h = harness();
	h.ads.loadForBuyer();
	assert.equal(h.added.length, 0);
});

test('a stored ad-free token loads the loader at startup, and a win reuses it', async () => {
	const h = harness({ storage: { 'ihtfy-ad-free': 'x.y.z' } });
	h.ads.loadForBuyer();
	assert.equal(h.added.length, 1);
	assert.equal(h.added[0].src, 'https://ihtfy.com/ads/v1.js');
	h.ads.show('seed/12');
	assert.equal(h.added.length, 1);
	h.added[0].listeners.load();
	await settle();
	assert.deepEqual(h.shown, [[h.els.winAdBox, 'seed/12']]);
});

test('an ad-free cookie alone loads the loader at startup', () => {
	const h = harness({ cookie: 'a=1; ihtfy-ad-free=x.y.z' });
	h.ads.loadForBuyer();
	assert.equal(h.added.length, 1);
});

test('a frame that may not read cookies still starts', () => {
	const h = harness();
	Object.defineProperty(h.context.document, 'cookie', { get() { throw new Error('SecurityError'); } });
	assert.doesNotThrow(() => h.ads.loadForBuyer());
	assert.equal(h.added.length, 0);
});

test('offline, the slot stays empty and no loader is requested', () => {
	const h = harness({ onLine: false });
	h.ads.show('seed/12');
	assert.equal(h.added.length, 0);
});

test('a failed loader stays quiet and is tried again on the next win', async () => {
	const h = harness();
	h.ads.show('seed/12');
	h.added[0].listeners.error();
	await settle();
	assert.equal(h.added[0].isConnected, false);
	assert.equal(h.shown.length, 0);
	h.ads.hide();
	h.ads.show('seed/30');
	assert.equal(h.added.length, 2);
});

test('playing on hides the slot and swaps in an empty box, so the next win gets its own ad', async () => {
	const h = harness();
	const first = h.els.winAdBox;
	h.ads.show('seed/12');
	h.added[0].listeners.load();
	await settle();
	h.ads.hide();
	assert.equal(h.els.winAd.hidden, true);
	assert.equal(first.isConnected, false);
	assert.notEqual(h.els.winAdBox, first);
	h.ads.show('seed/30');
	await settle();
	assert.deepEqual(h.shown, [[first, 'seed/12'], [h.els.winAdBox, 'seed/30']]);
});

test('a box removed before the loader arrives gets no ad, so its replacement can have the game over', async () => {
	const h = harness();
	const old = h.els.winAdBox;
	h.ads.show('seed/12');
	h.ads.hide();
	h.ads.show('seed/12');
	h.added[0].listeners.load();
	await settle();
	assert.deepEqual(h.shown, [[h.els.winAdBox, 'seed/12']]);
	assert.notEqual(h.els.winAdBox, old);
});

test('older cached HTML without the ad markup does not throw', () => {
	const h = harness();
	delete h.els.winAd;
	delete h.els.winAdBox;
	assert.doesNotThrow(() => { h.ads.hide(); h.ads.show('seed/1'); });
	assert.equal(h.added.length, 0);
});

test('boot keeps ?adtest=on when it strips the shuffle link', () => {
	const board = readFileSync(join(__dirname, '../scripts/board.js'), 'utf8');
	const line = board.split('\n').find(l => l.includes('if (linkSeed) history.replaceState'));
	for (const [search, expected] of [['?shuffle=apple&card=12&adtest=on', '/p?adtest=on'], ['?shuffle=apple&card=12', '/p']]) {
		let url = null;
		const params = new URLSearchParams(search);
		vm.runInContext(line, vm.createContext({ linkSeed: 'apple', params, location: { pathname: '/p' }, history: { replaceState: (_s, _t, u) => { url = u; } } }));
		assert.equal(url, expected);
	}
});

test('the ad beside the game loads nothing before the first tap or key press, then asks for its size', async () => {
	const h = harness({ adWidth: 160 });
	await settle();
	assert.equal(h.added.length, 0);
	h.input('keydown');
	await settle();
	assert.equal(h.added.length, 1);
	h.added[0].listeners.load();
	await settle();
	const box = h.els.playAdBox;
	assert.deepEqual(h.shown, [[box, 'play/1']]);
	assert.deepEqual({ ...box.dataset }, { adSlot: '7239875855', adSize: '160x600' });
});

test('a window without room for the ad beside the game, or offline, loads nothing', async () => {
	for (const h of [harness(), harness({ adWidth: 300, onLine: false })]) {
		h.input('pointerdown');
		await settle();
		h.playAd.newGame();
		assert.equal(h.added.length, 0);
	}
});

test('a new game gets a new box and key, but only a minute after the last ad', async () => {
	const h = harness({ adWidth: 300 });
	h.input('pointerdown');
	await settle();
	h.added[0].listeners.load();
	await settle();
	const first = h.els.playAdBox;
	h.clock.now = 59_999;
	h.playAd.newGame();
	await settle();
	assert.equal(h.shown.length, 1);
	h.clock.now = 60_000;
	h.playAd.newGame();
	await settle();
	assert.equal(first.isConnected, false);
	assert.deepEqual(h.shown, [[first, 'play/1'], [h.els.playAdBox, 'play/2']]);
	assert.equal(h.added.length, 1);
});

test('a window resized into the other size gets a new box and key; the dialog inset follows the ad', async () => {
	const h = harness({ adWidth: 160 });
	assert.equal(h.style.get('--play-ad-right'), '570px'); // 1920 - 1500 + 150
	h.input('pointerdown');
	await settle();
	h.added[0].listeners.load();
	await settle();
	h.layout.resized(); // same size: no new ad
	h.layout.adWidth = 300;
	h.layout.adLeft = 1400;
	h.layout.resized();
	await settle();
	assert.equal(h.style.get('--play-ad-right'), '670px');
	h.layout.adWidth = 0;
	h.layout.resized();
	assert.equal(h.style.has('--play-ad-right'), false);
	h.layout.adWidth = 300;
	h.layout.resized();
	await settle();
	assert.deepEqual(h.shown.map(([box, key]) => [box.dataset.adSize, key]), [['160x600', 'play/1'], ['300x600', 'play/2'], ['300x600', 'play/3']]);
});

test('a play box replaced before the loader arrives gets no ad', async () => {
	const h = harness({ adWidth: 160 });
	h.input('pointerdown');
	await settle();
	h.layout.adWidth = 300;
	h.layout.resized();
	h.added[0].listeners.load();
	await settle();
	assert.deepEqual(h.shown, [[h.els.playAdBox, 'play/2']]);
});

test('older cached HTML without the ad beside the game does not throw', async () => {
	const h = harness();
	delete h.els.playAd;
	delete h.els.playAdBox;
	h.input('pointerdown');
	await settle();
	assert.doesNotThrow(() => { h.layout.resized(); h.playAd.newGame(); });
	assert.equal(h.added.length, 0);
});

test('a token the loader rejects brings the ad beside the game back', async () => {
	const h = harness({ storage: { 'ihtfy-ad-free': 'forged' }, adFreeClass: true });
	h.window.ihtfyAds.adFree = async () => false;
	h.classList.onRemove = () => { h.layout.adWidth = 160; };
	h.input('pointerdown');
	assert.equal(h.added.length, 1);
	h.added[0].listeners.load();
	await settle();
	assert.equal(h.classes.has('ad-free'), false);
	assert.equal(h.style.get('--play-ad-right'), '570px');
	assert.deepEqual(h.shown.map(([, key]) => key), ['play/1']);
	assert.equal(h.shown[0][0].dataset.adSize, '160x600');
});

test('a token the loader accepts keeps the ad beside the game away', async () => {
	const h = harness({ storage: { 'ihtfy-ad-free': 'x.y.z' }, adFreeClass: true });
	h.input('pointerdown');
	h.added[0].listeners.load();
	await settle();
	assert.equal(h.classes.has('ad-free'), true);
	assert.equal(h.shown.length, 0);
});

test('a loader that fails to load keeps the ad beside the game away', async () => {
	const h = harness({ storage: { 'ihtfy-ad-free': 'x.y.z' }, adFreeClass: true });
	h.added[0].listeners.error();
	await settle();
	assert.equal(h.classes.has('ad-free'), true);
});

test('an ad still on its way stays out of a box the window has become too small for', async () => {
	const h = harness({ adWidth: 160 });
	h.input('pointerdown');
	await settle();
	const pending = h.els.playAdBox;
	assert.equal(pending.dataset.adSize, '160x600');
	h.layout.adWidth = 0;
	h.layout.resized();
	assert.equal(pending.isConnected, false);
	h.added[0].listeners.load();
	await settle();
	assert.equal(h.shown.length, 0);
});

// ---------- which screens get a box ----------
const html = readFileSync(join(__dirname, '../index.html'), 'utf8');
const css = readFileSync(join(__dirname, '../styles/styles.css'), 'utf8');

test('the biggest size that fits the room below the box top is used, down to 320x50', () => {
	const h = harness();
	for (const [room, size] of [[800, '300x250'], [250, '300x250'], [249, '320x100'], [100, '320x100'], [99, '320x50'], [10, '320x50']]) {
		assert.equal(h.ads.pickSize(room), size, `room ${room}`);
	}
});

test('the results box is sized from the window before any ad is asked for, offline too', () => {
	for (const [innerHeight, size] of [[640, '300x250'], [400, '320x100'], [300, '320x50']]) {
		for (const onLine of [true, false]) {
			const h = harness({ innerHeight, onLine });
			h.ads.show('seed/12');
			assert.equal(h.els.winAdBox.dataset.adSize, size);
		}
	}
});

test('play gets no ad: nothing loads or shows until the results screen appears, and it hides on play', async () => {
	const h = harness();
	h.results.hide();
	await settle();
	assert.equal(h.added.length, 0);
	assert.equal(h.els.winScreen.hidden, true);
	assert.equal(h.els.winAd.hidden, true);
	h.results.show('Team 1 wins, 10 to 4!', 'seed/12');
	assert.equal(h.els.winScreen.hidden, false);
	assert.equal(h.els.winScreen.parentElement.classes.has('is-won'), true);
	assert.equal(h.els.winText.textContent, 'Team 1 wins, 10 to 4!');
	assert.equal(h.els.winAd.hidden, false);
	assert.deepEqual(h.scrolls, [[0, 0]]);
	h.added[0].listeners.load();
	await settle();
	assert.deepEqual(h.shown.map(([, key]) => key), ['seed/12']);
	h.results.hide();
	assert.equal(h.els.winScreen.hidden, true);
	assert.equal(h.els.winScreen.parentElement.classes.has('is-won'), false);
	assert.equal(h.els.winAd.hidden, true);
});

test('the only ad box in the page is in the results screen, outside every dialog and pop-up', () => {
	assert.equal(html.match(/data-ad-slot=/g).length, 1);
	const screen = html.slice(html.indexOf('<section class="win-screen"'), html.indexOf('</section>', html.indexOf('<section class="win-screen"')));
	assert.ok(screen.includes('data-ad-slot="6470163205"'));
	assert.ok(screen.includes('<p class="win-ad-label">Advertisements</p>'));
	assert.match(screen, /<section class="win-screen" id="winScreen"[^>]* hidden>/);
	assert.match(screen, /<aside class="win-ad" id="winAd" hidden>/);
	// The dialog and the pop-up hold no box.
	const dialog = html.slice(html.indexOf('<dialog'), html.indexOf('</dialog>'));
	assert.equal(dialog.includes('data-ad-slot') || dialog.includes('Advertisements'), false);
	const popup = html.slice(html.indexOf('id="seedBox"'), html.indexOf('</div>\n\t\t\t\t\t\t</div>', html.indexOf('id="seedBox"')));
	assert.equal(popup.includes('data-ad-slot'), false);
});

test('the ad beside the game is hidden below 1440px, so a phone never gets it during play', () => {
	assert.match(css, /\n\.play-ad \{ display: none; \}/);
	const shows = [...css.matchAll(/\.play-ad \{ display: grid/g)];
	assert.equal(shows.length, 1);
	const between = css.slice(css.lastIndexOf('@media', shows[0].index), shows[0].index);
	assert.ok(between.startsWith('@media (min-width: 1440px)') && !between.includes('\n}'));
});

test('a buyer gets no box and no reserved space, and the ad is never fixed to the screen', () => {
	assert.match(css, /:root\.ad-free \.win-ad \{ display: none; \}|:root\.ad-free \.win-ad\s*\{[^}]*display: none/);
	const adCss = css.slice(css.indexOf('/* ---------- results screen'), css.indexOf('/* ---------- update banner'));
	assert.equal(/position:\s*(fixed|sticky)/.test(adCss), false);
	assert.equal(/\.win-ad[^{]*\{[^}]*display: none !important/.test(css), false);
});

test('the privacy links end in a slash', () => {
	const links = html.match(/https:\/\/ihtfy\.com\/privacy[^"]*/g);
	assert.equal(links.length, 3);
	assert.deepEqual([...new Set(links)], ['https://ihtfy.com/privacy/']);
});
