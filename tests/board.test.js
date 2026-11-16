// Run with: node --test
// Plays real cards through the game scripts in a fake page.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { boot, save } = require('./helpers/page.js');

test('the higher total wins outright when a card takes both teams past 10', () => {
	const store = { 'telewave.v2': save([8, 9]) };
	const page = boot(store);
	page.play(5, true); // team 1 scores 3 and team 2 calls the side: 11 to 10
	assert.match(page.$('score').textContent, /Team 1 wins, 11 to 10/);
	assert.equal(page.$('winScreen').hidden, false);
});

test('a 10-10 tie stays open until the first card that separates the teams', () => {
	const tied = boot({ 'telewave.v2': save([7, 10]) });
	tied.play(5, false); // 3 points: 10 to 10
	assert.match(tied.$('score').textContent, /Tied at 10: sudden death/);
	assert.equal(tied.$('winScreen').hidden, true);
	tied.$('new').click();
	tied.play(0, false); // team 2 hits the bullseye: 14 to 10
	assert.match(tied.$('score').textContent, /Team 2 wins, 14 to 10/);
	assert.equal(tied.$('winScreen').hidden, false);
});

test('a saved sudden-death game keeps totals above 10 after a reload', () => {
	const store = { 'telewave.v2': save([12, 12]) };
	const page = boot(store);
	assert.deepEqual(page.saved().scores, [12, 12]);
	page.$('new').click();
	assert.deepEqual(page.saved().scores, [12, 12]);
});

test('an older save with scores up to 10 still loads', () => {
	const page = boot({ 'telewave.v2': save([3, 10]) });
	assert.deepEqual(page.saved().scores, [3, 10]);
});

test('a reload between Guess and New card still passes the turn and blocks a second score', () => {
	const store = { 'telewave.v2': save([0, 1]) };
	let page = boot(store);
	page.$('commit').click(); // team 1 guesses the card
	page = boot(store); // reload: the same card comes back
	page.$('commit').click();
	assert.match(page.$('score').textContent, /already scored this card/);
	page.$('new').click();
	assert.equal(page.saved().turn, 1);
});

test('a saved score list of the wrong length falls back to the starting scores', () => {
	const page = boot({ 'telewave.v2': save([5]) });
	assert.deepEqual(page.saved().scores, [0, 1]);
});

test('a shared link with a card number that is not finite starts at card 1', () => {
	const page = boot({}, '?shuffle=apple&card=1e999');
	assert.equal(page.saved().card, 1);
});

test('a scored card stays scored across two reloads', () => {
	const store = { 'telewave.v2': save([0, 1]) };
	let page = boot(store);
	page.play(0, false); // bullseye: team 1 goes from 0 to 4
	assert.deepEqual(page.saved().scores, [4, 1]);
	page = boot(store);
	page = boot(store);
	page.$('commit').click();
	assert.match(page.$('score').textContent, /already scored this card/);
	assert.deepEqual(page.saved().scores, [4, 1]);
});

test('a card number that is not finite leaves the board on the current card', () => {
	for (const value of ['1e400', 'Infinity']) {
		const page = boot({ 'telewave.v2': save([0, 1], { card: 3 }) });
		page.$('seed').value = 'apple';
		page.$('cardNo').value = value;
		assert.doesNotThrow(() => page.$('cardNo').fire('change'));
		assert.equal(page.saved().card, 3);
		assert.equal(page.$('cardNo').value, 3);
	}
});

test('scores above 100 survive a reload unchanged', () => {
	const page = boot({ 'telewave.v2': save([102, 101]) });
	assert.deepEqual(page.saved().scores, [102, 101]);
});

test('a saved team name is capped to the length of the name field', () => {
	const page = boot({ 'telewave.v2': save([0, 1], { names: ['x'.repeat(10000), 'Team 2'] }) });
	assert.equal(page.saved().names[0].length, 24);
});
