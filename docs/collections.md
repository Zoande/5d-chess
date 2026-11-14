# Development collections and economy

All currency is earned in the game. There is no real-money purchase, withdrawal or cash-out integration. Accounts start with zero coins, a default player icon and the original pieces. The development frontend and Node server must be deployed together. Main is unchanged.

## Coins and completed games

Every newly created online game awards Elo and coins, including password-protected games. Local play awards neither. Once a full online game ends, each seat receives 60 coins, the surviving winner receives another 40, and each credited elimination earns 20. Shared elimination credit splits that bonus. The game’s once-only settlement marker prevents repeated payouts. Leaving an unfinished game does not pay out.

## The catalog

There are 20 player icons and 20 complete piece skin sets. Each category contains 4 common, 4 uncommon, 4 rare, 3 epic, 4 legendary and 1 mythic collectible. Skin sets cover all six piece kinds in red, blue, yellow and green. Each piece slot can equip a different owned set. Patterns are clipped to familiar chess silhouettes, and faction colors remain visible in the board, turn replay and physical travel animation. Cosmetics never change movement or strength.

Player icons are equipped through inventory; settings cannot grant or equip unowned icons. There is no custom icon upload. Inventory tracks each copy separately, including acquisition time, pending duplicate choices and active listings.

## Daily spin

One free spin is available per calendar day in `Europe/Amsterdam`. Reset is at local midnight, including the 23-hour spring day and 25-hour autumn day. The button counts down using a server-derived clock offset. Reward wedges are visual segments, not proportional probability areas; the wheel exposes the actual odds.

| Reward | Probability |
| --- | ---: |
| 40 coins | 41% |
| 80 coins | 30% |
| 150 coins | 16% |
| 300 coins | 8% |
| 1,000 coins | 3.5% |
| Rare icon or skin | 1.2% |
| Legendary icon or skin | 0.29% |
| Mythic icon or skin | 0.01% |

For an item reward, all items of that rarity across icons and skins are equally likely.

## Six crates

Bronze, Silver and Gold crates are available separately for icons and skins. Icon crates cost 120 / 450 / 1,200 coins; skin crates cost 160 / 600 / 1,600 coins.

| Rarity | Bronze | Silver | Gold |
| --- | ---: | ---: | ---: |
| Common | 69.9% | 25% | 5% |
| Uncommon | 24% | 40% | 18% |
| Rare | 5.5% | 27% | 42% |
| Epic | 0.59% | 7.4% | 30% |
| Legendary | 0.0099% | 0.59% | 4.9% |
| Mythic | 0.0001% | 0.01% | 0.1% |

Within each rarity, every item of the selected category is equally likely. There is no duplicate protection or pity system. A duplicate roll is saved as a pending inventory copy. Keep it for equipment/trading, or exchange it once for 12% of the catalog value, with a minimum of 10 coins. Pending copies cannot be equipped or listed. Closing or reloading a reveal preserves that choice in inventory.

The original CSS 3D chess chest arrives, lands, shakes and opens before a horizontal reel decelerates onto the saved item. Daily wheels also decelerate onto the actual reward. Both support reduced motion, Escape and Skip animation. Decoy reel items use the crate’s rarity distribution. No animation decides or changes the reward.

Reference reviewed: [DH4410/Overrun, `claude/ui-v2-plus-anim`](https://github.com/DH4410/Overrun/tree/claude/ui-v2-plus-anim), specifically its crate model and drop sequencing. This implementation uses original chess artwork and chest geometry; it does not redistribute that repository’s assets or code.

## Weekly shop and market

The shop changes each Monday at midnight Netherlands time. Its deterministic server selection includes two premium and two accessible items of each category. Catalog values range from 160 common to 12,000 mythic; the weekly shop excludes mythic items, which remain spin/crate rewards or market finds. Direct purchases buy the pictured item, and extra copies are tradable.

The market supports skins and player icons at seller-selected whole-coin prices from 1 to 100,000,000. There is no fee. A listing locks its exact copy; if no usable copy remains, that cosmetic is unequipped. The seller can cancel an unsold listing. A sale atomically deducts buyer coins, credits the seller, transfers the copy and removes the listing. A user cannot buy their own listing. Simultaneous buyers cannot both obtain the same copy. Limits: 100 listings per seller and 5,000 copies per inventory.

## Storage and verification

Coins, inventory, equipment, daily claims, listings and purchase receipts persist in `multiplayer.json`. Server-side cryptographic integer draws determine rewards. Mutations use the existing serialized queue and atomic file replacement. Clients never supply balances, odds or reward selections. The most recent 100 purchase/spin request receipts make ordinary request retries idempotent. The most recent 10 receipts are available for recovery inspection.

Back up the data file before upgrading and restart the updated Node server after building. Existing production/main is not deployed by this development push. Existing development accounts receive a new merged 1200 Elo and a zero-coin wallet lazily; there is no old Elo conversion. Existing explicitly casual rooms keep their eligibility flag; newly created online rooms are always eligible.

Tests cover every probability boundary, Dutch daylight-saving resets, zero-sum Elo, one-time rewards, ownership checks, duplicate choices, purchase retries, concurrent market buyers, restart persistence, real browser spins/reels, interrupted reveals, equipment, sales, and collection layouts at 768 / 393 / 320 pixels.
