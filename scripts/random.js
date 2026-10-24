// Seeded random numbers, so every device given the same seed word deals the same cards and targets.
// seededRandom(text) returns a function giving numbers in [0, 1): an FNV-1a hash of the text
// seeds a mulberry32 generator.
function seededRandom(text) {
	let state = 0x811c9dc5;
	for (let i = 0; i < text.length; i++) state = Math.imul(state ^ text.charCodeAt(i), 0x01000193);
	return () => {
		state = (state + 0x6d2b79f5) | 0;
		let t = Math.imul(state ^ (state >>> 15), state | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}
