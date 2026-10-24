// Run with: node --test
// Players on different devices share a seed word, so the same seed must always give the same numbers.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');

const context = vm.createContext({});
vm.runInContext(readFileSync(join(__dirname, '../scripts/random.js'), 'utf8'), context);
const draw = (seed, count) => { const rng = context.seededRandom(seed); return Array.from({ length: count }, rng); };

test('the same seed gives the same numbers', () => {
	assert.deepEqual(draw('otter|3', 50), draw('otter|3', 50));
});

test('different seeds give different numbers', () => {
	assert.notDeepEqual(draw('otter|3', 5), draw('otter|4', 5));
	assert.notDeepEqual(draw('otter|deck|0', 5), draw('otter|deck|1', 5));
});

test('numbers fall in [0, 1) and spread across it', () => {
	const values = draw('walrus', 10000);
	assert.ok(values.every(v => v >= 0 && v < 1));
	const tenths = new Array(10).fill(0);
	for (const v of values) tenths[Math.floor(v * 10)]++;
	assert.ok(tenths.every(n => n > 900 && n < 1100), tenths.join(','));
});
