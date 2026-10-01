# Basic instructions

* [Good video explaining the game](https://youtu.be/KuL_R60_320?t=225)
* The basis of this implementation is that **each seed generates a unique game**.
	* The seed shuffles the whole deck, and the **#** box counts which card you're on. Two devices with the same seed and card number show the same words and target.
	* Share the seed once at the start (or copy the link), then everyone presses **New card** together. No card repeats until the whole deck has been played.
	* It is possible then for the **clue giver** to open the board on their own computer/phone and **peek** at the target without having to share it in the videocall.
	* The copy button beside the seed copies a link with the current seed and card number to the clipboard. If devices drift apart, set the same card number on both.
* The dial:
	* Drag anywhere on the dial (or use the arrow keys when it is focused) to swing the red needle.
	* The shade covers the target. Drag the mint handle up and over to slide it open, or **hold** the Peek button to open it and release to close it.
* Functions:
	* Seed: any word or number; capitals and extra spaces are ignored. Press Enter (or click away) to apply it, which starts that seed's deck from card 1. "New game" picks a random word.
	* Card number (#): the position in the deck. Type a number to jump to that card.
	* New card: deals the next card in the deck. If the last card was scored, the turn passes to the other team.
	* Guess: locks the needle, opens the shade, and scores the round for the team whose turn it is.
	* Hold to peek: opens the shade while held.
	* Clear: closes the shade and resets the needle and guess token. A card is only scored once.
	* Percentage: toggles the percentage readout under the dial. (The official rulebook advises against using percentages to discuss the dial, yet I've found that they make playing via videocall much easier.)
* Scoring:
	* Bands are worth 4 (centre), 3 and 2 points. Team 2 starts on 1 point; first to 10 wins, ties go to sudden death.
	* Left/right bet: before the guess, the other team can place the pink guess token on the left or right of the card, betting the target is on that side of the needle. A correct bet scores them 1 point, unless the guess hit the 4-point band.
	* Catch-up: a team that scores 4 points but is still behind takes another turn.
	* Scores update automatically. Click a slot on a score track or use −/+ to correct them, click the turn badge to switch turns, and click a team name to rename it. "New game" resets the scores.
