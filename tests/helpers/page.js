// Runs the real game scripts in a fake page, for tests that play cards.
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');

const root = join(__dirname, '../..');

function stub(defaults = {}) {
	const target = Object.assign({ textContent: '', hidden: false, value: '', checked: true, offsetWidth: 0, listeners: {}, dataset: {}, isConnected: true }, defaults);
	target.addEventListener = (type, fn) => { (target.listeners[type] ??= []).push(fn); };
	target.fire = (type, event = {}) => (target.listeners[type] || []).forEach(fn => fn({ preventDefault() {}, target: proxy, ...event }));
	target.click = () => target.fire('click');
	const proxy = new Proxy(target, {
		get(t, p) {
			if (p in t) return t[p];
			if (p === 'style' || p === 'classList' || p === 'parentElement') return (t[p] = stub());
			if (typeof p === 'symbol') return undefined;
			return () => stub();
		},
		set(t, p, v) { t[p] = v; return true; }
	});
	return proxy;
}

// `store` is the fake localStorage contents; it keeps what the game saves, so booting again is a reload.
function boot(store, search = '') {
	const els = new Map();
	// The dial maps a pointer straight to its own coordinates, and the cover and needle record what they are set to.
	const special = {
		dial: { createSVGPoint: () => ({ matrixTransform() { return { x: this.x, y: this.y }; } }), getScreenCTM: () => ({ inverse() {} }) },
		shade: { attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } }
	};
	const $ = id => { if (!els.has(id)) els.set(id, stub({ id, ...special[id] })); return els.get(id); };
	const windowListeners = {};
	const context = vm.createContext({
		console, Math, JSON, URLSearchParams, Promise, String, Array, Object, Error, Date,
		navigator: { onLine: false },
		localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v; } },
		location: { search, origin: 'https://example.test', pathname: '/' },
		history: { replaceState() {} },
		matchMedia: () => ({ matches: true }),
		requestAnimationFrame: () => 1, cancelAnimationFrame() {}, setTimeout() {},
		addEventListener: (type, fn) => { (windowListeners[type] ??= []).push(fn); }, innerWidth: 400,
		ResizeObserver: class { observe() {} },
		window: { innerHeight: 800, scrollTo() {} },
		document: { getElementById: $, createElement: () => stub(), body: stub(), head: stub(), documentElement: stub({ clientWidth: 400 }), addEventListener() {}, cookie: '' }
	});
	for (const f of ['scripts/random.js', 'scripts/data.js', 'scripts/board.js']) vm.runInContext(readFileSync(join(root, f), 'utf8'), context, { filename: f });
	const seededRandom = vm.runInContext('seededRandom', context);
	const saved = () => JSON.parse(store['telewave.v2']);
	const key = k => $('dial').fire('keydown', { key: k });
	// Guess `offset` points away from the hidden target (0 is a bullseye); `bet` puts a left/right bet on the correct side.
	function play(offset, bet) {
		const s = saved();
		const target = 4.5 / 2 + seededRandom(`${s.seed}|${s.card}`)() * (100 - 4.5);
		const want = Math.round(target) + offset;
		key('Home');
		for (let i = 0; i < want; i++) key('ArrowRight');
		if (bet) $('gem' + (target < want ? 'L' : 'R')).click();
		$('commit').click();
	}
	// This page hears that another tab of the same browser saved: the browser sends a `storage` event with the new value.
	// `newValue` defaults to what the save holds now; pass an older save to play an event that arrives late.
	const heardSave = (newValue = store['telewave.v2']) => (windowListeners.storage || []).forEach(fn => fn({ key: 'telewave.v2', newValue }));
	// A pointer at (x, y) in the dial's own coordinates; `onHandle` is whether it lands on the cover's handle.
	const pointer = (type, x, y, onHandle = false) => $('dial').fire(type, { button: 0, clientX: x, clientY: y, pointerId: 1, target: { closest: sel => (onHandle && sel === '#handle' ? {} : null) } });
	return { $, saved, play, heardSave, pointer, store };
}

const save = (scores, extra = {}) => JSON.stringify({ scores, names: ['Team 1', 'Team 2'], turn: 0, pct: true, seed: 'apple', card: 1, ...extra });

module.exports = { boot, save };
