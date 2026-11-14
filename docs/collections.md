# Collections, cases and economy

Currency is earned in the game; there is no real-money purchase or cash-out. New accounts receive 480 welcome coins once. Completed online games award 60 coins per seat, another 40 for the surviving winner, and 20 per credited elimination (split when shared). Settlement is once-only. Local and unfinished games do not pay out.

## Ownership and Sets

The catalog contains player icons, frames, piece skins and piece outlines. Cosmetics never change chess rules or strength. New skin and outline rewards normally cover **one piece kind**: pawn, knight, bishop, rook, queen or king. Direct offers let the buyer choose the kind.

Every pre-existing universal skin or outline copy retains rights to all six kinds. No inventory conversion is performed. Stored item IDs, receipts and existing listings remain valid. The server accepts the old `/economy/crate` endpoint for compatibility; current UI uses Cases and `/economy/case`.

A **Set** contains all six skins of a design, all six outlines, or six skins plus six matching outlines when required. Inventory → Collections / Sets shows completion, missing pieces, and actions to equip or sell a complete Set. Listed or pending copies do not count as available. A legacy universal copy can satisfy six kinds without being expanded into six tradable copies.

The exclusive **ETC / Eternal Court Set** costs 85,000 coins and contains 12 copies: six mythic skins and six Eternal Crown outlines. These designs are excluded from ordinary cases and wheel pools.

## Shop slots

All resets use `Europe/Amsterdam`, including daylight saving. Selection is deterministic on the server; reloading does not reroll stock.

| Department | Stock | Reset |
| --- | --- | --- |
| Permanent cases | Scout, Artisan, Workshop | Always available |
| Weekly cases | Six unique slots: icon, skin, outline, mixed, frame, full Sets | Monday midnight |
| Weekly direct items | Four rare-or-better items, one per category | Monday midnight |
| Daily offers | Four direct deals, 25% off; one case, 15% off | Local midnight |
| Seasonal offers | Three seasonal cases and three seasonal direct items | First of the month |
| ETC Set | Exclusive complete Set | Always available |

Case selection uses catalog weights: premium cases appear less often. The daily case excludes that week's cases. Checkout verifies the current offer, window and price; stale offers are rejected before spending.

## Case rewards

Case previews show the format and exact odds:

- **Single cosmetics:** skins/outlines cover one randomly selected piece kind, equally likely among six kinds.
- **Singles + Sets:** mostly single cosmetics, with an explicit rare chance of a complete Set.
- **Complete Sets:** expensive cases award only complete Sets, including required outlines.

Authoritative distributions have exactly 1,000,000 integer tickets. Format probability is allocated separately from rarity, so displayed full-Set chances are exact. Designs within a rarity/category are equally likely. There is no pity system. Duplicate singles can be kept or exchanged once for 12% of catalog value, minimum 10 coins; pending copies cannot be equipped or sold. Full Sets are retained as tradable pieces.

Wheel-earned cases appear in Inventory → Cases. Opening costs no coins, consumes the case once, and remains possible after rotation. The server decides rewards before animation. Skip, reduced motion and receipt recovery never change the result.

## Daily wheel

One free spin is available per Dutch calendar day. After claiming it, extra spins cost **300 coins** and require confirmation. Paid spins do not delay the next free reset. There are **25 slots**:

| Rotation | Slots | Total draw probability |
| --- | ---: | ---: |
| Fixed | 10 | 80% |
| Daily | 5 | 10% |
| Weekly | 5 | 6% |
| Monthly / seasonal | 5 | 4% |

Rewards include coins, individual cosmetics, unopened cases and a rare complete seasonal Set. The odds window shows the current pool and exact probabilities. A rotating case slot's probability is capped according to its price; remaining probability stays within its rotation group. Tests check expected catalog value remains below the paid spin price across 370 days.

Wedges have intentionally unequal **visual** sizes independent of draw odds. The rarest reward remains visible. Cryptographic server draws, never screen geometry, select prizes. Receipts store the full wheel pool so recovered reveals use the original day's wheel. Historical eight-slot receipts retain their original presentation.

## Market

Individual copies and complete Sets can be listed for 1–100,000,000 whole coins, with an optional plain-text description up to 240 characters. There is no fee. A Set listing locks its exact component copies; cancellation unlocks all. A sale transfers every member and both coin balances in one SQL transaction. Incomplete Sets cannot be sold as complete. Equipment is reconciled per piece kind when rights leave inventory.

Set listing retries do not create another listing, including after sale or cancellation. Buyers cannot buy their own listings; competing buyers cannot receive the same copies. Capacity is checked before spending. Limits: 100 listings per seller, 5,000 cosmetic copies per inventory, 500 unopened cases.

## Persistence and deployment

Wallets, per-piece rights, Set escrow, cases, equipment, claims and receipts persist in `DATA_DIR/chess.sqlite`. These use compatible optional JSON fields; no schema migration or grant replay is required. SQL transactions also roll back mutated objects on failure. Receipts make purchase/spin retries idempotent and allow interrupted-reveal recovery.

Deploy the client and Node server together. Make a private SQLite backup first and restart only the chess PM2 process. See [Server architecture and operations](server-storage.md).

Tests cover exact weights, rotation clocks, legacy ownership, per-piece equipment, Set escrow/transfer/retries/rollback/restart, capacity failures, saved cases, yearly wheel value, browser purchases/sales/reveals and small-screen layouts.
