// The ad below the board comes from the shared IHTFY loader, which ihtfy.com serves for
// all the games (its source is in the IHTFY/com.ihtfy repo). Nothing ad-related loads
// until a team wins: the loader arrives then, and AdSense after it at browser idle.
// The slot hides again as soon as play goes on.
window.winAd = (() => {
	const LOADER = 'https://ihtfy.com/ads/v1.js';
	const $ = id => document.getElementById(id);
	let loader = null;

	// Fills the box with an ad for the game over named `key`; offline or on failure it stays empty.
	function show(key) {
		$('winAd').hidden = false;
		if (!navigator.onLine) return;
		loader ??= new Promise((resolve, reject) => {
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
		});
		// hide() swaps the box out; a box removed while the loader was on its way gets no ad.
		const box = $('winAdBox');
		loader.then(() => box.isConnected && window.ihtfyAds.show(box, key), () => {});
	}

	// Swaps in an empty box, so the next win gets its own ad instead of keeping this one.
	function hide() {
		const aside = $('winAd');
		if (aside.hidden) return;
		aside.hidden = true;
		const box = $('winAdBox');
		box.replaceWith(box.cloneNode(false));
	}

	return { show, hide };
})();
