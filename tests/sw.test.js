// Run with: node --test
// The service worker must never answer ad or consent requests, from cache or otherwise.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');

function fetchHandler() {
	const listeners = {};
	// Only the routing is under test, so the cache never answers.
	const self = { addEventListener: (name, callback) => { listeners[name] = callback; } };
	vm.runInContext(readFileSync(join(__dirname, '../sw.js'), 'utf8'), vm.createContext({
		self, URL, location: new URL('https://frequency.ihtfy.com/sw.js'), caches: { open: () => new Promise(() => {}) }, fetch() {}, setTimeout
	}));
	return url => {
		let answered = false;
		listeners.fetch({ request: { url, method: 'GET', mode: 'no-cors' }, respondWith: () => { answered = true; } });
		return answered;
	};
}

test('the game and its own fonts go through the worker', () => {
	const answers = fetchHandler();
	assert.equal(answers('https://frequency.ihtfy.com/scripts/board.js'), true);
	assert.equal(answers('https://frequency.ihtfy.com/fonts/karla-latin-wght-normal.woff2'), true);
});

test('the page, stylesheet and worker name no font host, and the worker precaches the fonts', () => {
	const read = f => readFileSync(join(__dirname, '..', f), 'utf8');
	for (const f of ['index.html', 'styles/styles.css', 'sw.js']) assert.doesNotMatch(read(f), /fonts\.(googleapis|gstatic)\.com/, f);
	for (const font of read('styles/styles.css').match(/fonts\/[\w-]+\.woff2/g)) assert.ok(read('sw.js').includes(`'${font}'`), font);
});

test('ad, consent and other third-party requests pass straight to the network', () => {
	const answers = fetchHandler();
	for (const url of [
		'https://ihtfy.com/ads/v1.js',
		'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-0',
		'https://tpc.googlesyndication.com/sodar/x.js',
		'https://googleads.g.doubleclick.net/pagead/ads?x=1',
		'https://ep1.adtrafficquality.google/getconfig/sodar',
		'https://fundingchoicesmessages.google.com/i/pub?ers=1',
		'https://www.google.com/recaptcha/api2/aframe',
		'https://www.gstatic.com/images/x.png',
		'https://www.googleadservices.com/pagead/conversion.js',
		// Fonts the consent message asks for are not the game's, and the game asks for none.
		'https://fonts.googleapis.com/css2?family=Google+Sans',
		'https://fonts.gstatic.com/s/googlesans/v1/c.woff2'
	]) assert.equal(answers(url), false, url);
});
