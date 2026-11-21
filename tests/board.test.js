// Run with: node --test
// Plays real cards through the game scripts in a fake page.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
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

test('a card number too large to add one to is not kept, so New card still advances', () => {
	const linked = boot({}, '?shuffle=apple&card=1e20');
	assert.equal(linked.saved().card, 1);
	linked.$('new').click();
	assert.equal(linked.saved().card, 2);
	const typed = boot({ 'telewave.v2': save([0, 1], { card: 3 }) });
	typed.$('seed').value = 'apple';
	typed.$('cardNo').value = '1e20';
	typed.$('cardNo').fire('change');
	assert.equal(typed.saved().card, 3);
	typed.$('new').click();
	assert.equal(typed.saved().card, 4);
});

test('New card from the highest card number wraps to card 1', () => {
	const page = boot({}, `?shuffle=apple&card=${Number.MAX_SAFE_INTEGER - 1}`);
	assert.equal(page.saved().card, Number.MAX_SAFE_INTEGER - 1);
	page.$('new').click();
	assert.equal(page.saved().card, 1);
});

test('scores above 100 survive a reload unchanged', () => {
	const page = boot({ 'telewave.v2': save([102, 101]) });
	assert.deepEqual(page.saved().scores, [102, 101]);
});

test('a saved team name is capped to the length of the name field', () => {
	const page = boot({ 'telewave.v2': save([0, 1], { names: ['x'.repeat(10000), 'Team 2'] }) });
	assert.equal(page.saved().names[0].length, 24);
});

test('a reload after a team won brings back the results screen', () => {
	const store = { 'telewave.v2': save([8, 9]) };
	let page = boot(store);
	page.play(5, true); // 11 to 10
	page = boot(store);
	assert.equal(page.$('winScreen').hidden, false);
	assert.match(page.$('winText').textContent, /Team 1 wins, 11 to 10/);
	page.$('commit').click();
	assert.match(page.$('score').textContent, /already scored this card/);
	assert.deepEqual(page.saved().scores, [11, 10]);
});

test('a reload after a tie, or a score under 10, shows no results screen', () => {
	let page = boot({ 'telewave.v2': save([7, 10]) });
	page.play(5, false); // 10 to 10
	assert.equal(boot(page.store).$('winScreen').hidden, true);
	const store = { 'telewave.v2': save([0, 1]) };
	page = boot(store);
	page.play(0, false);
	assert.equal(boot(store).$('winScreen').hidden, true);
});

test('a tab that missed another tab\'s card does not save its old scores over them', () => {
	const store = { 'telewave.v2': save([0, 1]) };
	const first = boot(store);
	const second = boot(store);
	first.play(0, false); // 4 to 1
	second.heardSave();
	second.$('turn').click(); // any change saves the second tab's state
	assert.deepEqual(second.saved().scores, [4, 1]);
});

test('a tab hearing that another tab moved to the next card follows it without passing the turn again', () => {
	const store = { 'telewave.v2': save([0, 1]) };
	const first = boot(store);
	const second = boot(store);
	first.play(0, false);
	first.$('new').click(); // card 2, team 2's turn
	second.heardSave();
	assert.equal(second.$('cardNo').value, 2);
	assert.equal(second.$('word1').textContent, first.$('word1').textContent);
	second.$('commit').click(); // team 2 guesses card 2 on the second tab
	assert.equal(second.saved().turn, 1);
	assert.equal(second.saved().card, 2);
	assert.equal(second.saved().scores[0], 4);
});

test('a tab hearing that another tab won shows the results screen', () => {
	const store = { 'telewave.v2': save([8, 9]) };
	const first = boot(store);
	const second = boot(store);
	first.play(5, true);
	second.heardSave();
	assert.equal(second.$('winScreen').hidden, false);
	assert.match(second.$('winText').textContent, /Team 1 wins, 11 to 10/);
});

test('a tab hearing that another tab started a new game leaves the results screen', () => {
	const store = { 'telewave.v2': save([8, 9]) };
	const first = boot(store);
	const second = boot(store);
	first.play(5, true);
	second.heardSave();
	first.$('newGame').click();
	second.heardSave();
	assert.equal(second.$('winScreen').hidden, true);
	assert.equal(second.$('seed').value, first.$('seed').value);
	second.$('turn').click(); // a change saves this tab's state: the new game's scores
	assert.deepEqual(second.saved().scores, [0, 1]);
});

test('a tab showing a win hides it when another tab corrects the scores below 10', () => {
	const store = { 'telewave.v2': save([8, 9]) };
	const first = boot(store);
	const second = boot(store);
	first.play(5, true); // 11 to 10
	second.heardSave();
	assert.equal(second.$('winScreen').hidden, false);
	store['telewave.v2'] = save([6, 9], { scored: true }); // the first tab fixes the scores
	second.heardSave();
	assert.equal(second.$('winScreen').hidden, true);
	assert.deepEqual(second.saved().scores, [6, 9]);
});

test('a tab hearing a new game that picked the same shuffle word and card starts the round over', () => {
	const store = { 'telewave.v2': save([8, 9]) };
	const first = boot(store);
	const second = boot(store);
	first.play(5, true); // card 1 won, 11 to 10
	second.heardSave();
	assert.equal(second.$('winScreen').hidden, false);
	const random = Math.random;
	Math.random = () => 0; // the first shuffle word, apple: the same as the game just played
	try { first.$('newGame').click(); } finally { Math.random = random; }
	assert.equal(first.saved().seed, 'apple');
	assert.equal(first.saved().card, 1);
	second.heardSave();
	assert.equal(second.$('winScreen').hidden, true);
	second.play(0, false); // Guess must work again: a bullseye for team 1
	assert.deepEqual(second.saved().scores, [4, 1]);
});

test('a late storage event does not undo a card this tab scored since', () => {
	const store = { 'telewave.v2': save([0, 1]) };
	const other = boot(store);
	const mine = boot(store);
	other.$('turn').click(); // the other tab saves a change (the turn)
	const late = store['telewave.v2'];
	mine.play(0, false); // this tab scores before hearing about it: 4 to 1
	mine.heardSave(late);
	mine.$('name0').fire('input', { target: { value: 'Red' } }); // any change saves this tab's state
	assert.deepEqual(mine.saved().scores, [4, 1]);
});

test('a tap on the cover\'s handle moves the needle and leaves the cover shut', () => {
	const page = boot({ 'telewave.v2': save([0, 1]) });
	page.pointer('pointerdown', 650, 325, true); // on the handle, near the right rim
	page.pointer('pointerup', 650, 325, true);
	assert.equal(page.$('guessdisp').value, '99%');
	assert.match(page.$('shade').attrs.transform, /^rotate\(0 /);
});

test('a drag on the handle opens the cover and leaves the needle', () => {
	const page = boot({ 'telewave.v2': save([0, 1]) });
	page.pointer('pointerdown', 650, 325, true);
	page.pointer('pointermove', 600, 200, true);
	page.pointer('pointermove', 380, 60, true); // the top of the dial: the cover is half open
	page.pointer('pointerup', 380, 60, true);
	assert.match(page.$('shade').attrs.transform, /^rotate\(-90 /);
	assert.equal(page.$('guessdisp').value, '50%');
});

test('a tap on the dial away from the handle still moves the needle', () => {
	const page = boot({ 'telewave.v2': save([0, 1]) });
	page.pointer('pointerdown', 380, 60);
	page.pointer('pointerup', 380, 60);
	assert.equal(page.$('guessdisp').value, '50%');
	page.pointer('pointerdown', 100, 250);
	assert.notEqual(page.$('guessdisp').value, '50%');
});

test('a failed read on startup keeps the stored match, and a new game replaces it', () => {
	const original = save([8, 7]);
	const disk = { 'telewave.v2': original };
	let fail = true;
	const page = boot(new Proxy(disk, {
		get(target, name) {
			if (name === 'telewave.v2' && fail) { fail = false; throw Error('read unavailable'); }
			return target[name];
		}
	}));
	page.$('name0').fire('input', { target: { value: 'Owls' } });
	page.$('percentages').fire('change');
	assert.equal(disk['telewave.v2'], original);
	page.$('newGame').click();
	assert.deepEqual(JSON.parse(disk['telewave.v2']).scores, [0, 1]);
});

test('empty or damaged storage still saves on the first visit', () => {
	assert.deepEqual(boot({}).saved().scores, [0, 1]);
	assert.deepEqual(boot({ 'telewave.v2': '{not json' }).saved().scores, [0, 1]);
});

test('moving focus off Hold to peek while its key is down closes the cover', () => {
	for (const key of [' ', 'Enter']) {
		const page = boot({ 'telewave.v2': save([0, 1]) });
		page.$('reveal').fire('keydown', { key });
		assert.match(page.$('shade').attrs.transform, /^rotate\(-180 /);
		page.$('reveal').fire('blur'); // Tab to Guess; the key's release goes to Guess
		assert.match(page.$('shade').attrs.transform, /^rotate\(0 /, key);
	}
});

test('losing focus after Guess leaves the scored card uncovered', () => {
	const page = boot({ 'telewave.v2': save([0, 1]) });
	page.play(0, false);
	page.$('reveal').fire('blur');
	assert.match(page.$('shade').attrs.transform, /^rotate\(-180 /);
});

test('the Shuffle fields opt out of form restoration, so Back cannot restore an old card number', () => {
	const html = readFileSync(join(__dirname, '../index.html'), 'utf8');
	for (const id of ['seed', 'cardNo']) assert.match(html, new RegExp(`<input[^>]* id="${id}"[^>]* autocomplete="off"`), id);
});

test('the Shuffle panel hangs from the whole header, so a wrapped menu cannot push it off the left edge', () => {
	const css = readFileSync(join(__dirname, '../styles/styles.css'), 'utf8');
	assert.match(css, /#header \{ position: relative;/);
	assert.doesNotMatch(css, /\.pop-wrap \{ position: relative/);
});
