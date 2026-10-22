// Run with: node --test
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');

// Just enough DOM for scripts/ads.js: elements by id, attached or not.
class FakeElement {
	constructor(id) { this.id = id; this.isConnected = true; this.hidden = true; this.listeners = {}; }
	addEventListener(name, callback) { this.listeners[name] = callback; }
	remove() { this.isConnected = false; }
}

function harness({ onLine = true } = {}) {
	const added = [];
	const shown = [];
	const els = { winAd: new FakeElement('winAd'), winAdBox: new FakeElement('winAdBox') };
	els.winAdBox.cloneNode = () => new FakeElement('winAdBox');
	els.winAdBox.replaceWith = function (fresh) { this.isConnected = false; els.winAdBox = fresh; fresh.replaceWith = this.replaceWith; fresh.cloneNode = this.cloneNode; };
	const window = { ihtfyAds: { show: (box, key) => shown.push([box, key]) } };
	const context = vm.createContext({
		window,
		navigator: { onLine },
		document: {
			getElementById: id => els[id],
			createElement: () => new FakeElement(),
			head: { appendChild: el => { added.push(el); } }
		}
	});
	vm.runInContext(readFileSync(join(__dirname, '../scripts/ads.js'), 'utf8'), context);
	return { ads: window.winAd, els, added, shown };
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
