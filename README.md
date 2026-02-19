# Lottery Reality Check

A visual experiment into the absurdity of lottery odds.

You're looking at a grid of **139,838,160** tiles — every possible EuroMillions combination, laid out in one place. Exactly one of them is the jackpot. The rest are mostly worthless. Go find it.

## The Point

People buy lottery tickets with a vague sense that they *might* win. This makes that feeling concrete: here is every ticket that has ever existed or ever will exist, and here is how many of them win anything meaningful. Spoiler: it's not many.

## How It Works

- The jackpot combination is derived deterministically from a random seed using HMAC-SHA256, generated fresh each session
- Prize tiers follow **real EuroMillions rules** — your ticket's prize is determined by how many numbers it shares with the jackpot combination (5+2 = jackpot, 5+1 = Tier 2, and so on down to 2+0 = Tier 13)
- Because prizes are match-based, the game is deductible: find a Tier 2 ticket (5 main + 1 star matched) and you know all 5 main numbers. Work backwards from there
- The grid is shuffled so near-miss combinations don't cluster visually
- All prize computation happens client-side — no server round-trips per reveal

## Cheating Is Fine

The jackpot is derivable from the session seed (exposed in the network response). If you want to reverse-engineer it, go ahead — that's half the fun. The "Give Up" button just does this for you after 100,000 tickets.

## Stack

- **Next.js 16** (App Router, Turbopack)
- **React 19**
- **TypeScript 5**
- **Tailwind CSS 4**
- Pure-JS SHA-256 / HMAC-SHA256 (no `crypto.subtle` — works on HTTP and any browser)
- HTML5 Canvas for the grid and minimap
- Web Audio API for sound effects

## Running Locally

```bash
npm install
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

## Prize Tiers (EuroMillions)

| Tier | Match | Prize |
|------|-------|-------|
| Jackpot | 5 + 2 stars | €17,000,000 |
| Tier 2 | 5 + 1 star | €300,000 |
| Tier 3 | 5 + 0 stars | €50,000 |
| Tier 4 | 4 + 2 stars | €3,000 |
| Tier 5 | 4 + 1 star | €150 |
| Tier 6 | 3 + 2 stars | €75 |
| Tier 7 | 4 + 0 stars | €50 |
| Tier 8 | 2 + 2 stars | €15 |
| Tier 9 | 3 + 1 star | €12 |
| Tier 10 | 3 + 0 stars | €10 |
| Tier 11 | 1 + 2 stars | €8 |
| Tier 12 | 2 + 1 star | €5 |
| Tier 13 | 2 + 0 stars | €3 |

In 139,838,160 tickets there are exactly **1** jackpot, **20** Tier 2 tickets, **45** Tier 3 tickets... and roughly 108 million losers.
