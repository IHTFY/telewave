// The ads below the board and beside the game come from the shared IHTFY loader, which
// ihtfy.com serves for all the games (its source is in the IHTFY/com.ihtfy repo). Nothing
// ad-related loads until a team wins or, on a window wide enough for the ad beside the
// game, until the first tap or key press: the loader arrives then, and AdSense after it at
// browser idle. A visitor who may have bought ad-free gets the loader at startup instead
// (loadForBuyer), so it can hide the slot before it shows. The slot below the board hides
// again as soon as play goes on. The results screen that holds it replaces the board, so the box, the result
// and the buttons are in view together; it picks the biggest of three sizes that fits the window.
const winAd = (() => {
	const LOADER = 'https://ihtfy.com/ads/v1.js';
	// The sizes the box may take, biggest first, as [data-ad-size, height]: the first that fits the room
	// between the box's top and the bottom of the window.
	const SIZES = [['300x250', 250], ['320x100', 100], ['320x50', 50]];
	const pickSize = room => (SIZES.find(([, height]) => height <= room) ?? SIZES.at(-1))[0];
	const $ = id => document.getElementById(id);
	let loader = null;

	const load = () => (loader ??= new Promise((resolve, reject) => {
		const script = document.createElement('script');
		script.async = true;
		script.src = LOADER;
		script.addEventListener('load', resolve);
		script.addEventListener('error', () => {
			script.remove();
			loader = null;
			reject(new Error('The ad loader did not load'));
		});
		document.head.appendChild(script);
	}));

	// Loads the loader now if this browser holds an ad-free token; the loader checks it.
	function loadForBuyer() {
		let found = false;
		try { found = !!localStorage.getItem('ihtfy-ad-free'); } catch { /* storage off: the cookie may still hold it */ }
		try { found ||= /(?:^|;\s*)ihtfy-ad-free=/.test(document.cookie); } catch { /* a sandboxed frame may not read cookies */ }
		if (found) load().catch(() => {});
	}

	// Fills the box with an ad for the game over named `key`; offline or on failure it stays empty.
	function show(key) {
		const aside = $('winAd');
		if (!aside) return; // cached older HTML without the ad markup
		aside.hidden = false;
		const box = $('winAdBox');
		// Sized before any ad comes, so nothing shifts when it fills; offline the empty box keeps that size too.
		box.dataset.adSize = pickSize(window.innerHeight - box.getBoundingClientRect().top);
		if (!navigator.onLine) return;
		const ready = load();
		// hide() swaps the box out; a box removed while the loader was on its way gets no ad.
		ready.then(() => box.isConnected && window.ihtfyAds.show(box, key), () => {});
	}

	// Swaps in an empty box, so the next win gets its own ad instead of keeping this one.
	function hide() {
		const aside = $('winAd');
		if (!aside || aside.hidden) return;
		aside.hidden = true;
		const box = $('winAdBox');
		box.replaceWith(box.cloneNode(false));
	}

	return { show, hide, loadForBuyer, load, pickSize };
})();

// The results screen takes the board's place after a win, so the result, the buttons and the ad are in view
// together. It is the only screen that gets an ad on a phone: the board never does.
const results = (() => {
	const $ = id => document.getElementById(id);

	function show(msg, key) {
		$('winText').textContent = msg;
		$('winScreen').hidden = false;
		$('winScreen').parentElement.classList.add('is-won');
		// The player may have scrolled down to the Guess button; the box is placed and sized from the top of the page.
		window.scrollTo(0, 0);
		winAd.show(key);
		$('playAgain').focus({ preventScroll: true });
	}

	function hide() {
		winAd.hide();
		$('winScreen').hidden = true;
		$('winScreen').parentElement.classList.remove('is-won');
	}

	return { show, hide };
})();

// The ad beside the game. The stylesheet decides whether the window has room for it and at
// which width (160 or 300px); a browser that may hold an ad-free token gets none. Each new
// game gets a new box and key, so a new ad, but at most once a minute, since a game can be
// cut short; so does a window resized into the other size. The ad never changes on a timer.
const playAd = (() => {
	// The games-play unit: 300×600 in AdSense; the 160×600 box uses it too.
	const PLAY_AD_SLOT = '7239875855';
	const MIN_NEW_GAME_GAP = 60 * 1000;
	const $ = id => document.getElementById(id);
	const root = document.documentElement;
	let started = false;
	let shownSize = null;
	let requestedAt = -Infinity;
	let opened = 0;

	// The size the stylesheet gives the box, or null where the ad is hidden (or the markup is missing).
	const size = () => {
		const box = $('playAdBox');
		return box?.offsetWidth ? `${box.offsetWidth}x600` : null;
	};

	// A box holds one ad, so a new key gets an empty box.
	function emptyBox() {
		const box = $('playAdBox');
		const fresh = box.cloneNode(false);
		box.replaceWith(fresh);
		return fresh;
	}

	function request() {
		shownSize = size();
		if (!shownSize) {
			// The window got too small for the ad: an ad still on its way must not land in the hidden box.
			if (opened) emptyBox();
			return;
		}
		if (!navigator.onLine) return;
		const box = opened ? emptyBox() : $('playAdBox');
		box.dataset.adSlot = PLAY_AD_SLOT;
		box.dataset.adSize = shownSize;
		const key = `play/${++opened}`;
		requestedAt = Date.now();
		// A box replaced while the loader was on its way gets no ad. A loader that fails to load leaves the
		// box empty, and the next new game tries again.
		winAd.load().then(() => box.isConnected && window.ihtfyAds.show(box, key), () => {});
	}

	function newGame() {
		if (started && Date.now() - requestedAt >= MIN_NEW_GAME_GAP) request();
	}

	const firstInput = new Promise(resolve => {
		for (const type of ['pointerdown', 'keydown']) addEventListener(type, resolve, { once: true, capture: true });
	});
	firstInput.then(() => {
		started = true;
		request();
	});

	// The instructions dialog and its backdrop stop 150px short of the ad.
	function fit() {
		const current = size();
		if (current) root.style.setProperty('--play-ad-right', `${Math.round(root.clientWidth - $('playAd').getBoundingClientRect().left + 150)}px`);
		else root.style.removeProperty('--play-ad-right');
		if (started && current !== shownSize) request();
	}
	// The root resizes with the window and when a scrollbar comes or goes; either can move the ad or change its size.
	new ResizeObserver(fit).observe(root);

	// The script in <head> hides the ad for any browser holding an ad-free token. The loader checks the token, and
	// a token it rejects brings the ad back. A loader that fails to load keeps it hidden, since no ad could load then either.
	if (root.classList.contains('ad-free')) {
		winAd.load().then(() => window.ihtfyAds.adFree(), () => true).then(free => {
			if (free) return;
			root.classList.remove('ad-free');
			fit();
		});
	}

	return { newGame };
})();

// ---------- board ----------
(() => {
	const $ = id => document.getElementById(id);

	// ---------- storage (optional, per browser) ----------
	const STORE = 'telewave.v2';
	const load = () => { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch (e) { return {}; } };
	const save = () => {
		try { localStorage.setItem(STORE, JSON.stringify({ scores: game.scores, names: game.names, turn: game.turn, pct: $('percentages').checked, seed: game.seed, card: game.card })); } catch (e) { /* storage unavailable */ }
	};

	// ---------- geometry: one mapping shared by target, needle, ticks and pointer ----------
	const CX = 380, CY = 330, R = 270, RC = R + 26;
	const BAND = 4.5; // width of each scoring band, in percent
	const ang = v => Math.PI * (1 - v / 100); // 0% = left horizon, 100% = right horizon
	const pt = (v, r) => [CX + r * Math.cos(ang(v)), CY - r * Math.sin(ang(v))];
	const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
	const toValue = (x, y) => {
		let a = Math.atan2(CY - y, x - CX);
		if (a < 0) a = x < CX ? Math.PI : 0; // below the horizon: snap to the nearest end
		return clamp(100 * (1 - a / Math.PI), 0, 100);
	};
	const halfDisk = r => `M${CX - r},${CY} A${r},${r} 0 0 1 ${CX + r},${CY} Z`;
	const wedge = (v0, v1, r) => {
		const [x0, y0] = pt(v0, r), [x1, y1] = pt(v1, r);
		return `M${CX},${CY} L${x0},${y0} A${r},${r} 0 0 1 ${x1},${y1} Z`;
	};
	const svg = $('dial');
	const svgPoint = e => {
		const p = svg.createSVGPoint();
		p.x = e.clientX; p.y = e.clientY;
		return p.matrixTransform(svg.getScreenCTM().inverse());
	};
	const attrs = (el, o) => { for (const k in o) el.setAttribute(k, o[k]); };

	// ---------- static drawing ----------
	(function speckle() {
		const c = document.createElement('canvas');
		c.width = c.height = 220;
		const g = c.getContext('2d');
		let s = 7;
		const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
		for (let i = 0; i < 260; i++) {
			g.fillStyle = `rgba(255,255,255,${0.25 + rnd() * 0.6})`;
			g.beginPath(); g.arc(rnd() * 220, rnd() * 220, rnd() * 1.1 + 0.3, 0, 7); g.fill();
		}
		const url = c.toDataURL();
		$('speckImg').setAttribute('href', url);
		document.body.style.setProperty('--speckle', `url(${url})`);
	})();

	const casingD = `M${CX - RC},${CY} A${RC},${RC} 0 0 1 ${CX + RC},${CY} L${CX + RC},${CY + 40} Q${CX + RC},${CY + 86} ${CX + RC - 46},${CY + 86} L${CX - RC + 46},${CY + 86} Q${CX - RC},${CY + 86} ${CX - RC},${CY + 40} Z`;
	const panelD = `M${CX - RC},${CY} L${CX + RC},${CY} L${CX + RC},${CY + 40} Q${CX + RC},${CY + 86} ${CX + RC - 46},${CY + 86} L${CX - RC + 46},${CY + 86} Q${CX - RC},${CY + 86} ${CX - RC},${CY + 40} Z`;
	['casing', 'casingSpeck'].forEach(id => $(id).setAttribute('d', casingD));
	['panel', 'panelSpeck'].forEach(id => $(id).setAttribute('d', panelD));
	$('face').setAttribute('d', halfDisk(R));
	$('faceClipPath').setAttribute('d', halfDisk(R));
	$('shade').setAttribute('d', halfDisk(R + 1));
	attrs($('stopL'), { x: CX - R - 30, y: CY - 16, width: 40, height: 14 });
	attrs($('handleBar'), { x: CX + R - 12, y: CY - 9, width: 96, height: 18 });
	attrs($('handleHit'), { x: CX + R - 30, y: CY - 30, width: 130, height: 60 });
	['hub', 'hubRing'].forEach(id => attrs($(id), { cx: CX, cy: CY }));
	attrs($('guessLine'), { x1: CX, y1: CY });

	let html = '';
	for (let i = 0; i <= 40; i++) {
		const a = Math.PI * i / 40;
		html += `<circle cx="${CX + (RC + 6) * Math.cos(a)}" cy="${CY - (RC + 6) * Math.sin(a)}" r="14" fill="var(--scallop)"/>`;
	}
	$('scallops').innerHTML = html;
	html = '';
	for (let v = 0; v <= 100; v += 10) {
		const [x1, y1] = pt(v, R), [x2, y2] = pt(v, R - (v % 50 ? 10 : 18));
		html += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="var(--tick)" stroke-width="2"/>`;
	}
	$('ticks').innerHTML = html;

	const GEM = '<svg viewBox="0 0 30 52" aria-hidden="true"><g clip-path="url(#gemClip)"><rect width="30" height="52" fill="url(#gemFade)"/><path d="M7 52V30C7 16 12 7 19 1C23 -2.4 27 -6 31 -12H60V52ZM23 52V30C23 16 18 7 11 1C7 -2.4 3 -6 -1 -12H-30V52ZM11 52V30C11 16 16 7 23 1C27 -2.4 31 -6 35 -12H60V52ZM19 52V30C19 16 14 7 7 1C3 -2.4 -1 -6 -5 -12H-30V52ZM15 52V30C15 16 20 7 27 1C31 -2.4 35 -6 39 -12H60V52ZM15 52V30C15 16 10 7 3 1C-1 -2.4 -5 -6 -9 -12H-30V52Z" fill-rule="evenodd" fill="var(--gem)" fill-opacity=".5"/></g><path d="M3 51V30C3 16 8 7 15 1C22 7 27 16 27 30V51Z" fill="none" stroke="rgba(0,0,0,.25)" stroke-width="1.5"/></svg>';
	$('gemL').innerHTML = GEM;
	$('gemR').innerHTML = GEM;

	// ---------- state ----------
	const saved = load();
	const game = {
		scores: Array.isArray(saved.scores) ? saved.scores.map(n => clamp(+n || 0, 0, 10)) : [0, 1], // team 2 starts at 1, as in the rules
		names: Array.isArray(saved.names) ? saved.names.map(String) : ['Team 1', 'Team 2'],
		turn: saved.turn === 1 ? 1 : 0,
		seed: '', card: 1, // one seed per game shuffles the deck; card counts through it
	};
	const round = { target: 50, guess: 50, gem: null, revealed: false, scored: false, extraTurn: false };
	let shade = 0, shadeGoal = 0; // degrees the cover is rotated open: 0 closed, 180 fully open

	// ---------- rendering ----------
	const BANDS = [[-2.5, -1.5, '#f2a33a', 2], [-1.5, -0.5, '#e8603c', 3], [-0.5, 0.5, '#9ec4e4', 4], [0.5, 1.5, '#e8603c', 3], [1.5, 2.5, '#f2a33a', 2]];
	function drawTarget() {
		const t = round.target;
		$('target').innerHTML = BANDS.map(([a, z, col, n]) => {
			const mid = t + (a + z) / 2 * BAND, [lx, ly] = pt(mid, R - 28);
			const rot = 90 - ang(mid) * 180 / Math.PI;
			return `<path d="${wedge(t + a * BAND, t + z * BAND, R + 2)}" fill="${col}"/>` +
				`<text x="${lx}" y="${ly}" font-family="Fredoka, sans-serif" font-weight="600" font-size="22" fill="#16203a" text-anchor="middle" dominant-baseline="middle" transform="rotate(${rot} ${lx} ${ly})">${n}</text>`;
		}).join('');
	}
	function drawNeedle() {
		const [x, y] = pt(round.guess, R - 14);
		attrs($('guessLine'), { x2: x, y2: y });
		const v = Math.round(round.guess);
		svg.setAttribute('aria-valuenow', v);
		$('guessdisp').value = v + '%';
	}
	function drawShade() {
		const t = `rotate(${-shade} ${CX} ${CY})`;
		$('shade').setAttribute('transform', t);
		$('handle').setAttribute('transform', t);
	}
	function drawGem() {
		['L', 'R'].forEach(side => $('gem' + side).setAttribute('aria-pressed', round.gem === side));
	}
	function drawScores() {
		[0, 1].forEach(i => {
			$('head' + i).style.setProperty('--n', game.scores[i]);
			$('track' + i).classList.toggle('active', game.turn === i);
		});
		const turn = $('turn');
		turn.dataset.team = game.turn;
		$('turnText').textContent = `${game.names[game.turn]}'s turn`;
		save();
	}
	function setStatus(msg) { $('score').textContent = msg; }

	let raf = 0;
	function animateShade(goal) {
		shadeGoal = goal;
		cancelAnimationFrame(raf);
		const instant = matchMedia('(prefers-reduced-motion: reduce)').matches;
		const step = () => {
			const d = shadeGoal - shade;
			shade = instant || Math.abs(d) < 0.5 ? shadeGoal : shade + d * 0.18;
			drawShade();
			if (shade !== shadeGoal) raf = requestAnimationFrame(step);
		};
		step();
	}

	// ---------- score tracks ----------
	const HEAD = '<path d="M17 2C8 2 3 9 3 16c0 4 1 6 1 8l-3 5 4 1v4c0 3 2 4 5 4h3v4h14V29c4-3 6-8 6-13C33 8 27 2 17 2Z" fill="var(--team-color)" stroke="rgba(0,0,0,.25)" stroke-width="1.5"/>';
	[0, 1].forEach(i => {
		const el = $('track' + i);
		el.style.setProperty('--team-color', `var(--team${i})`);
		let slots = '';
		for (let n = 10; n >= 0; n--) slots += `<button type="button" class="slot" data-n="${n}" aria-label="Set team ${i + 1} score to ${n}"><span>${n}</span></button>`;
		el.innerHTML =
			`<input class="team-name" id="name${i}" maxlength="24" aria-label="Team ${i + 1} name">` +
			`<div class="rail">${slots}<svg class="head" id="head${i}" viewBox="0 0 34 42" aria-hidden="true">${HEAD}</svg></div>` +
			`<div class="bump"><button type="button" data-d="-1" aria-label="Team ${i + 1} minus one">&minus;</button><button type="button" data-d="1" aria-label="Team ${i + 1} plus one">+</button></div>`;
		el.addEventListener('click', e => {
			const b = e.target.closest('button');
			if (!b) return;
			game.scores[i] = clamp(b.dataset.n !== undefined ? +b.dataset.n : game.scores[i] + +b.dataset.d, 0, 10);
			drawScores();
		});
		$('name' + i).value = game.names[i];
		$('name' + i).addEventListener('input', e => { game.names[i] = e.target.value.trim() || `Team ${i + 1}`; drawScores(); });
	});

	// ---------- rounds ----------
	const CARD_COLORS = ['#5bb9a4', '#e9866a', '#9ec4e4', '#f2a33a', '#c5abc2', '#9fd08a', '#f2d0d6', '#e8c65a', '#81bed3', '#e59ab5'];

	// Redmean colour distance, so the two halves of a card never look alike.
	const hexRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
	const colorDist = (a, b) => {
		const [r1, g1, b1] = hexRgb(a), [r2, g2, b2] = hexRgb(b), r = (r1 + r2) / 2;
		return Math.sqrt((2 + r / 256) * (r1 - r2) ** 2 + 4 * (g1 - g2) ** 2 + (2 + (255 - r) / 256) * (b1 - b2) ** 2);
	};
	const MIN_DIST = 100;

	// Toss a copy of the old card off-screen so the new one appears to be underneath it.
	function throwCard() {
		const card = $('card');
		if (!card.textContent.trim() || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
		const r = card.getBoundingClientRect();
		const ghost = card.cloneNode(true);
		ghost.removeAttribute('id');
		ghost.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
		ghost.setAttribute('aria-hidden', 'true');
		Object.assign(ghost.style, { position: 'fixed', left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, margin: 0, zIndex: 50, pointerEvents: 'none', boxShadow: '0 14px 28px rgba(0, 0, 0, .35)' });
		document.body.appendChild(ghost);
		const dir = Math.random() < 0.5 ? -1 : 1;
		const dx = dir * (innerWidth / 2 + r.width), dy = -r.height * (0.4 + Math.random() * 0.6);
		ghost.animate([
			{ transform: 'translate(0, 0) rotate(0deg)' },
			{ transform: `translate(${dx * 0.08}px, ${dy * 0.25}px) rotate(${dir * 4}deg) scale(1.04)`, offset: 0.2 },
			{ transform: `translate(${dx}px, ${dy}px) rotate(${dir * (25 + Math.random() * 20)}deg)` }
		], { duration: 420, easing: 'cubic-bezier(.4, 0, .9, .6)' }).onfinish = () => ghost.remove();
		card.animate([{ transform: 'scale(.94)', filter: 'brightness(.85)' }, { transform: 'none', filter: 'none' }], { duration: 260, easing: 'ease-out' });
	}

	// ---------- seed: one shared word per game, cards dealt in a seeded shuffle ----------
	const SEED_WORDS = ['apple', 'banjo', 'cactus', 'dragon', 'ember', 'falcon', 'gecko', 'harbor', 'igloo', 'jelly', 'koala', 'lemon',
		'mango', 'nectar', 'otter', 'pepper', 'quartz', 'rocket', 'salsa', 'tiger', 'umbra', 'velvet', 'walrus', 'yeti', 'zebra',
		'acorn', 'bagel', 'comet', 'daisy', 'eagle', 'fudge', 'ginger', 'hippo', 'island', 'jungle', 'kettle', 'llama', 'maple',
		'noodle', 'orbit', 'panda', 'quilt', 'raven', 'sherpa', 'tulip', 'violet', 'waffle', 'yodel', 'zigzag', 'anchor', 'bison',
		'cobalt', 'dune', 'echo', 'fern', 'glacier', 'honey', 'indigo', 'jasper', 'kiwi', 'lotus', 'meadow', 'nugget', 'opal',
		'pickle', 'radish', 'saturn', 'tofu', 'walnut', 'pretzel', 'canyon', 'marble', 'pebble', 'puffin', 'sprout', 'tundra'];
	const normSeed = v => String(v).trim().toLowerCase().replace(/\s+/g, ' ');
	const randomSeed = () => SEED_WORDS[Math.floor(Math.random() * SEED_WORDS.length)];

	// Card n of a seed: every card appears once per pass through the deck, then it reshuffles.
	function deal(seed, n) {
		const pass = Math.floor((n - 1) / data.length);
		const order = data.map((_, i) => i);
		const shuffle = seededRandom(`${seed}|deck|${pass}`);
		for (let i = order.length - 1; i > 0; i--) {
			const j = Math.floor(shuffle() * (i + 1));
			[order[i], order[j]] = [order[j], order[i]];
		}
		return data[order[(n - 1) % data.length]];
	}

	function showSeed() {
		$('seed').value = game.seed;
		$('cardNo').value = game.card;
	}

	function flashSeed() {
		const box = $('seedBox');
		box.classList.remove('applied');
		void box.offsetWidth; // restart the animation
		box.classList.add('applied');
	}

	function startRound() {
		throwCard();
		// Pass the turn only once the previous card was actually scored (and no catch-up turn was earned).
		if (round.scored && !round.extraTurn) game.turn = 1 - game.turn;
		const rng = seededRandom(`${game.seed}|${game.card}`);
		round.target = BAND / 2 + rng() * (100 - BAND); // keep the 4-point band fully on the dial
		const words = deal(game.seed, game.card);
		const c0 = Math.floor(rng() * CARD_COLORS.length);
		const apart = CARD_COLORS.filter(c => colorDist(c, CARD_COLORS[c0]) >= MIN_DIST);
		const right = apart[Math.floor(rng() * apart.length)];
		$('word1').textContent = words[0];
		$('word2').textContent = words[1];
		$('side1').style.background = CARD_COLORS[c0];
		$('side2').style.background = right;
		Object.assign(round, { scored: false, extraTurn: false });
		showSeed();
		drawTarget();
		clearRound();
		drawScores();
	}

	function clearRound() {
		Object.assign(round, { guess: 50, gem: null, revealed: false });
		svg.classList.remove('locked');
		animateShade(0);
		drawNeedle();
		drawGem();
		setStatus('');
		results.hide(); // play goes on: no ad while a card is up
	}

	const points = d => d <= BAND / 2 ? 4 : d <= BAND * 1.5 ? 3 : d <= BAND * 2.5 ? 2 : 0;

	function guess() {
		if (round.revealed) return;
		round.revealed = true;
		svg.classList.add('locked');
		animateShade(180);
		const pts = points(Math.abs(round.target - round.guess));
		const me = game.turn, them = 1 - me;
		let msg = pts ? `${pts} points${'!'.repeat(pts - 1)}` : 'Missed: 0 points';
		// Left/right bet: the other team scores 1 if right, unless the guess hit the bullseye.
		let bonus = 0;
		if (round.gem && pts !== 4) {
			const right = (round.gem === 'L') === (round.target < round.guess);
			bonus = right ? 1 : 0;
			msg += right ? ` · ${game.names[them]} called the side: +1` : ` · ${game.names[them]} picked the wrong side`;
		}
		if (round.scored) {
			msg += ' (already scored this card)';
		} else {
			round.scored = true;
			game.scores[me] = clamp(game.scores[me] + pts, 0, 10);
			game.scores[them] = clamp(game.scores[them] + bonus, 0, 10);
			// Catch-up rule: a bullseye by a team that is still behind earns another turn.
			round.extraTurn = pts === 4 && game.scores[me] < game.scores[them];
			if (round.extraTurn) msg += ` · Still behind: ${game.names[me]} goes again`;
			const [a, b] = game.scores;
			if (a >= 10 || b >= 10) {
				msg = a === b ? `${msg} · Tied at ${a}: sudden death!` : `${game.names[a > b ? 0 : 1]} wins, ${Math.max(a, b)} to ${Math.min(a, b)}!`;
				if (a !== b) { showSeedBox(false); results.show(msg, `${game.seed}/${game.card}`); }
			}
			drawScores();
		}
		setStatus(msg);
	}

	function nextCard() {
		game.card++;
		startRound();
	}

	// ---------- dial interaction ----------
	let dragging = null;
	svg.addEventListener('pointerdown', e => {
		if (e.button > 0) return;
		const p = svgPoint(e);
		if (e.target.closest('#handle')) dragging = 'shade';
		else if (!round.revealed && p.y <= CY + 20) {
			dragging = 'needle';
			round.guess = toValue(p.x, p.y);
			drawNeedle();
		}
		if (dragging) {
			cancelAnimationFrame(raf);
			svg.setPointerCapture(e.pointerId);
			e.preventDefault();
		}
	});
	svg.addEventListener('pointermove', e => {
		if (!dragging) return;
		const p = svgPoint(e);
		if (dragging === 'needle') {
			round.guess = toValue(p.x, p.y);
			drawNeedle();
		} else {
			shade = shadeGoal = 180 - toValue(p.x, p.y) * 1.8;
			drawShade();
		}
	});
	const endDrag = () => { dragging = null; };
	svg.addEventListener('pointerup', endDrag);
	svg.addEventListener('pointercancel', endDrag);
	svg.addEventListener('keydown', e => {
		if (round.revealed) return;
		const d = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1, PageDown: -10, PageUp: 10, Home: -100, End: 100 }[e.key];
		if (!d) return;
		e.preventDefault();
		round.guess = clamp(Math.round(round.guess) + d, 0, 100);
		drawNeedle();
	});

	// ---------- hold to peek ----------
	const peek = $('reveal');
	const peekOn = e => { e.preventDefault(); animateShade(180); };
	const peekOff = () => { if (!round.revealed) animateShade(0); };
	peek.addEventListener('pointerdown', peekOn);
	['pointerup', 'pointerleave', 'pointercancel'].forEach(t => peek.addEventListener(t, peekOff));
	peek.addEventListener('keydown', e => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) peekOn(e); });
	peek.addEventListener('keyup', e => { if (e.key === ' ' || e.key === 'Enter') peekOff(); });
	peek.addEventListener('contextmenu', e => e.preventDefault());

	// ---------- buttons ----------
	$('commit').addEventListener('click', guess);
	$('reset').addEventListener('click', clearRound);
	$('playAgain').addEventListener('click', () => $('newGame').click());
	$('backToBoard').addEventListener('click', () => { results.hide(); $('commit').focus(); });
	$('new').addEventListener('click', nextCard);
	['L', 'R'].forEach(side => $('gem' + side).addEventListener('click', () => {
		if (round.revealed) return;
		round.gem = round.gem === side ? null : side;
		drawGem();
	}));
	$('turn').addEventListener('click', () => { game.turn = 1 - game.turn; drawScores(); });
	$('newGame').addEventListener('click', () => {
		game.scores = [0, 1];
		game.turn = 0;
		round.scored = false;
		game.seed = randomSeed();
		game.card = 1;
		startRound();
		flashSeed();
		playAd.newGame();
	});

	const pct = $('percentages');
	const applyPct = () => { $('guessdisp').classList.toggle('off', !pct.checked); save(); };
	pct.addEventListener('change', applyPct);

	// Typed shuffle words and card numbers apply on Enter or when the box loses focus, never mid-typing.
	const applySeed = from => {
		const seed = normSeed($('seed').value) || randomSeed();
		const card = Math.max(1, Math.floor(+$('cardNo').value) || 1);
		const seedChanged = seed !== game.seed;
		if (!seedChanged && card === game.card) return showSeed();
		game.seed = seed;
		game.card = seedChanged && from === 'seed' ? 1 : card; // a new seed starts its deck from the top
		startRound();
		flashSeed();
	};
	['seed', 'cardNo'].forEach(id => {
		$(id).addEventListener('change', () => applySeed(id));
		$(id).addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $(id).blur(); } });
	});

	$('copySeed').addEventListener('click', () => {
		const url = `${location.origin}${location.pathname}?shuffle=${encodeURIComponent(game.seed)}&card=${game.card}`;
		const btn = $('copySeed');
		const done = () => { btn.classList.add('copied'); setTimeout(() => btn.classList.remove('copied'), 1200); };
		const fallback = () => {
			const el = document.createElement('textarea');
			el.value = url;
			el.setAttribute('readonly', '');
			el.style.cssText = 'position:absolute;left:-9999px';
			document.body.appendChild(el);
			el.select();
			try { document.execCommand('copy'); done(); } catch (err) { /* nothing more to try */ }
			el.remove();
		};
		if (navigator.clipboard) navigator.clipboard.writeText(url).then(done, fallback);
		else fallback();
	});

	// Shuffle tools only matter when several devices share a game, so they live in a popup.
	const showSeedBox = open => {
		$('seedBox').hidden = !open;
		$('seedToggle').setAttribute('aria-expanded', open);
	};
	$('seedToggle').addEventListener('click', () => showSeedBox($('seedBox').hidden));
	document.addEventListener('pointerdown', e => { if (!e.target.closest('.pop-wrap')) showSeedBox(false); });
	document.addEventListener('keydown', e => {
		if (e.key === 'Escape' && !$('seedBox').hidden) { showSeedBox(false); $('seedToggle').focus(); }
	});

	// ---------- instructions ----------
	const help = $('help');
	$('helpBtn').addEventListener('click', () => help.showModal());
	$('helpClose').addEventListener('click', () => help.close());
	help.addEventListener('click', e => { if (e.target === help) help.close(); }); // click on the backdrop

	// ---------- boot ----------
	const params = new URLSearchParams(location.search);
	const linkSeed = normSeed(params.get('shuffle') || params.get('seed') || ''); // ?seed= was the old name
	// The loader checks ?adtest=on later, so the cleanup keeps it: a check run must never get live ads.
	if (linkSeed) history.replaceState({}, '', params.get('adtest') === 'on' ? `${location.pathname}?adtest=on` : location.pathname);
	winAd.loadForBuyer();
	showSeedBox(!!linkSeed); // arriving from a shared link: show what was shared
	game.seed = linkSeed || normSeed(saved.seed || '') || randomSeed();
	game.card = Math.max(1, Math.floor(+(linkSeed ? params.get('card') : saved.card)) || 1);
	if (saved.pct === false) pct.checked = false;
	applyPct();
	drawShade();
	startRound();
})();
