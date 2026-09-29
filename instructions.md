# Basic instructions

* [Good video explaining the game](https://youtu.be/KuL_R60_320?t=225)
* The basis of this implementation is that **each seed generates a unique board**.
	* This means that when two people input the same seed, they will have the same target position and words.
	* It is possible then for the **clue giver** to open the board on their own computer/phone and **peek** at the target without having to share it in the videocall.
	* The copy button beside the seed copies a link with the current seed to the clipboard.
* The dial:
	* Drag anywhere on the dial (or use the arrow keys when it is focused) to swing the red needle.
	* The shade covers the target. Drag the mint handle up and over to slide it open, or **hold** the Peek button to open it and release to close it.
* Functions:
	* Seed: generates a unique board. The seed can be **any combination of numbers and letters**. (Tip: using words makes it easier to share the seed.)
	* New card: generates a new random seed. If the last card was scored, the turn passes to the other team.
	* Guess: locks the needle, opens the shade, and scores the round for the team whose turn it is.
	* Hold to peek: opens the shade while held.
	* Clear: closes the shade and resets the needle and guess token. A card is only scored once.
	* Percentage: toggles the percentage readout under the dial. (The official rulebook advises against using percentages to discuss the dial, yet I've found that they make playing via videocall much easier.)
* Scoring:
	* Bands are worth 4 (centre), 3 and 2 points. Team 2 starts on 1 point; first to 10 wins, ties go to sudden death.
	* Left/right bet: before the guess, the other team can place the pink guess token on the left or right of the card, betting the target is on that side of the needle. A correct bet scores them 1 point, unless the guess hit the 4-point band.
	* Catch-up: a team that scores 4 points but is still behind takes another turn.
	* Scores update automatically. Click a slot on a score track or use −/+ to correct them, click the turn badge to switch turns, and click a team name to rename it. "New game" resets the scores.
