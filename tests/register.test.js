// Run with: node --test
// The page reloads when a new worker takes over, but only for an update: on a first
// visit the worker claims the page too, and a reload there would throw the game away.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');

// The registration script is the last inline script in index.html.
function registrationScript() {
	const scripts = [...readFileSync(join(__dirname, '../index.html'), 'utf8').matchAll(/<script>([\s\S]*?)<\/script>/g)];
	return scripts[scripts.length - 1][1];
}

// `controlled` is whether a worker already controls the page when it loads.
async function visit({ controlled }) {
	const page = new EventTarget();
	const serviceWorker = Object.assign(new EventTarget(), {
		controller: controlled ? {} : null,
		register: async () => Object.assign(new EventTarget(), { waiting: null, update: async () => {} })
	});
	let reloads = 0;
	const banner = { hidden: true };
	vm.runInContext(registrationScript(), vm.createContext({
		navigator: { serviceWorker },
		addEventListener: page.addEventListener.bind(page),
		document: { getElementById: () => banner, addEventListener() {}, hidden: false },
		location: { reload: () => { reloads++; } },
		setInterval() {}
	}));
	page.dispatchEvent(new Event('load'));
	await new Promise(resolve => setImmediate(resolve));
	// The worker takes control, as clients.claim() does on activate (and again after SKIP_WAITING).
	const takeOver = () => {
		serviceWorker.controller = {};
		serviceWorker.dispatchEvent(new Event('controllerchange'));
	};
	return { takeOver, reloads: () => reloads };
}

test('a first visit does not reload when the worker claims the page', async () => {
	const visitor = await visit({ controlled: false });
	visitor.takeOver();
	assert.equal(visitor.reloads(), 0);
});

test('an update reloads exactly once when the new worker takes over', async () => {
	const visitor = await visit({ controlled: true });
	visitor.takeOver();
	visitor.takeOver();
	assert.equal(visitor.reloads(), 1);
});
