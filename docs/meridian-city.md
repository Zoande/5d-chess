# Meridian city expansion

Open the City from the signed-in header. Walk with WASD or the joystick and press E or the interaction button at a counter or a closed residential door. The city requires WebGL 2. If graphics are unavailable, the city entrance offers Retry and Back home.

[View the hotel, tower apartments, bakery and taxi rank in game](review/visualupgrade/meridian.webp)

## Bank, hotbar and homes

The middle counter at Fifth Dimension Bank exchanges whole coins between the existing wallet and carried cash. Loans, repayments, rewards and existing shops continue to use the wallet. A withdrawal leaves fractional bank balances intact.

Click a food slot to eat or drink. With the mouse captured, press 1–9 to select a slot and click in the city to use it. The item rises into view for 2.4 seconds and restores 20 HP when the animation finishes, up to 100 HP. A slot holds nine portions of the same food, one weapon, or a stack of cash. Collect takeaway at the till or a served tray at your restaurant table. If the order will not fit, it waits for you.

At the Royal, each motel key opens a private room for one hour. Store carried cash and weapons in its dresser and food in its minibar. At checkout, drawer contents go to the bank recovery counter. Minibar contents return to available inventory slots, with overflow available at the same counter.

[Backstage Single](images/royal-single.webp) · [Aureate Penthouse](images/royal-penthouse.webp)

Existing SQLite accounts acquire the hotbar on first use. Older food quantities fill available slots in menu order. The cash counter holds excess for collection after space opens. Contents of an expired drawer also go to the recovery counter. Expired fridge contents fill available slots and excess goes to recovery. The legacy food field remains a projection of carried food.

Visit Town Hall for the searchable housing register. The four residential towers have private full-floor apartments. For Exchange Crown, choose **PH** in the Exchange lift and speak to the housing clerk above the LOT floor. Clerks sell or lease available units using the existing deed system.

The kitchen counter has a storage drawer in each house and apartment. An active deed or lease allows its resident to put away and retrieve cash and weapons. Walk up to the drawer to use it. Food goes in the existing fridge.

Pulse & Pixel, the arcade gun shop, stands on the north sidewalk at the northwest end of Civic Avenue. Walk through the lit storefront door, walk to the display counter and leave through the same doorway. Mara’s counter sells the Pistol (25 coins), SMG (60), Assault Rifle (95), Shotgun (80), and Sniper Rifle (140). Select an item and pay with carried cash or banked coins. Checkout shows both balances and the destination hotbar slot. Existing pulse blasters appear as Pistols. Each weapon type has its own magazine. Stowing a weapon, switching slots, or logging out preserves that magazine.

In the 3D view, click to capture the mouse, then click to fire at the reticle. Hold the mouse button for automatic fire with the SMG or Assault Rifle. Hold the right button to aim, press R to reload, and hold Shift while moving to sprint. V or the Camera button switches between first and third person. The hotbar also offers target selection, Fire and Reload on touch screens. Arcade shots cross open doorways in either direction. Walls, closed doors and solid floors block the line of sight. Firing raises the wanted level. Players respawn at the city entrance. The carried slots become one collectible bag at the death location. Pickup requires room for the entire bag. Banked coins, cosmetics and home contents stay with their owner. When a secondary city instance empties, its unclaimed bags move to the same coordinates in the first instance.

[Player models at Pulse & Pixel](review/overrun/players.webp) · [First-person showroom view](review/overrun/shop.webp) · [Asset provenance](../provenance.txt)

At KFC, move the spatula, scoop and soda cup with the mouse, touch or arrow keys. The gloved hand follows the utensil, and nearby players see the cook move their arm. [Grill screenshot](review/overrun/kitchen.webp)

## Exchange Tower and the weekly lottery

Buy weekly draw tickets at the Royal’s lobby stand. To trade shares, use the Exchange Tower elevator and search for LOT. The two brokers on floor 103 accept market and limit orders through the city exchange. The weekly jackpot receives 99% of ticket sales. LOT shareholders split the other 1% according to shares held at the draw. Existing lottery holdings and accrued dividends carry over.

Three city residents trade CAS, BNK, LOT and PRI with their own coin balances. Across the entire exchange they attempt one ordinary order of up to two shares every half hour. They leave the last listed share for players. When a stock has no offers, a resident who owns shares lists up to three immediately.

Visit the financial advisor in reception to see your holdings, cash, daily and lifetime gains, dividends and open orders. Gains include closed positions. Select **Sell all** beside a stock to review the proceeds for the entire holding before confirming. Reserved shares, an expired external quote or insufficient bids can prevent a full sale.

[LOT trading floor](review/lottery-exchange/lottery-floor.jpg) · [Financial advisor](review/lottery-exchange/financial-advisor.jpg) · [Mobile sale confirmation](review/lottery-exchange/advisor-sale-mobile.jpg)

## Meridian Prison shares

Search for **PRI** in the Exchange Tower lift. Floor 104 has two brokers for market and limit orders, live price screens and a brass clock above the lift. PRI opens with 1,000 shares at 25 coins each. Completed trades set subsequent prices. The reception advisor includes PRI holdings, sale quotes, gains and dividends.

Each inmate generates 100 new coins per 24 hours served, including offline time. Short stays earn a proportional amount. The inmate keeps their wallet. At booking, the prison freezes the existing bank loans and locks a one-time surcharge of 50% of the outstanding balance. Each inmate’s earnings pay that inmate’s loans first, then the surcharge. BNK receives the principal as loan repayment and the interest through its ordinary profit ledger. On release the unpaid surcharge is waived. Any remaining original loan resumes at its original rate with its remaining repayment time.

Every 24 hours PRI distributes the remaining income in proportion to outstanding shares and notifies each player paid. For a 100-coin loan, day one pays BNK 100. Day two pays BNK 50 and shareholders 50. Each further full day pays shareholders 100. Undistributed fractional coins and pools with no shareholders carry forward. Bookings already active when the feature is installed start earning at installation.

BNK and CAS check for distributable profit at midnight in Amsterdam and notify recipients. LOT distributes at its weekly draw.

[PRI trading floor](review/prison-exchange.jpg)

## Meridian Police

Enter Meridian Police from the south sidewalk on Civic Avenue, between the signed front columns near the patrol cars. Public enquiries and booking face the lobby. The central staircase leads to five visitor galleries. Walk both flights and turn on the landing to reach each gallery. The GUNS and PRISON header links take you directly to the showroom and the public police lobby. Take the staircase back down to leave through the lobby. West Wing holds cells 01–25 and East Wing holds 26–50, five on each side of each gallery. Cell 50 faces the public corridor on level five. Bars separate visitors from the cell interiors. Occupied cells show their inmate even after logout or a server restart. [Lobby and stairs](review/overrun/prison.webp)

| Stars | Patrol | Active time to clear | Sentence |
| --- | --- | --- | --- |
| 1 | One officer searches the last reported area | 10 minutes | 2 minutes |
| 2 | Two officers, wider sight range | 20 minutes | 10 minutes |
| 3 | Three officers search suspect-owned or leased homes and seize stored weapons there | 40 minutes | 1 hour |
| 4 | Four officers also search nearby properties | 60 minutes | 6 hours |
| 5 | Five officers, helicopter tracking and a dog team | 90 minutes | 24 hours |

Firing adds a star. A knockout adds another, up to five. Escalation restarts clearance. Authenticated requests and the shell heartbeat count time while connected. Logout, a server restart or a gap over 30 seconds pauses accrual. Patrol advances on city updates. Delayed updates have a bounded movement step. A dog warning gives the suspect time to move away, and another attempt requires a cooldown. Officers book on contact. If all cells are occupied, the suspect keeps their wanted level until a spot opens or it clears. Searches leave other residents' belongings alone.

The shared inventory and sentence constants are in `src/world/arcade.ts`. Pursuit speed, sight, dog range, warning, cooldown and raid timing are in `server/city-arcade.ts`. The system uses game distances and a last-known-position search. NPCs return after a short recovery. Venue counters continue serving other accounts.

## Custody and moderation

Sentences use a persistent UTC deadline. Expiry applies offline, including when the next visitor opens the station. At startup the precinct translates saved cell positions from the previous layout into their assigned cells. It preserves the offset inside the cell where space permits, the viewing direction, sentence and jigsaw. Unclaimed bags in the old interiors move inside their respective front doors. Cell assignments, transfers and pickup use the store's SQLite writer transactions. The account retains its login name. Public views use the current numbered inmate alias. Chess deadline maintenance and settlement continue while the inmate's requests to play are locked.

Signing in during a sentence opens the normal home dashboard under the inmate alias. Matchmaking, purchases and rewards are disabled. Every city shortcut enters the assigned cell. Move and look using the usual city controls. In permanent custody, approach the jigsaw table and press E or tap its prompt. Choose a loose piece and its matching space in any of 40 sections. On phones, tapping a piece shows the board, and a correct fit brings back the tray. Each fit saves immediately. Close with ×, E or Escape to return to the cell. Completing all 1,000 pieces releases the player unless a moderator has reserved release.

The operator command requires filesystem access to the intended existing SQLite directory and Node 24+. These examples target a disposable **local** database.

```sh
DATA_DIR=/tmp/chess-fixture node scripts/city-custody.mjs jail "Test Player"
DATA_DIR=/tmp/chess-fixture node scripts/city-custody.mjs jail "Test Player" --no-release
DATA_DIR=/tmp/chess-fixture node scripts/city-custody.mjs release "Test Player"
```

The flag keeps the sentence active after puzzle completion. Only an operator can lift it. There is no web moderation endpoint.

## Local verification

- `npm test` builds the clients and server and runs the Node suite. `tests/city-expansion.test.mjs` uses loopback HTTP, signed-in test accounts, temporary SQLite directories, a controlled clock and the operator CLI. It exercises migration, overflow recovery, cash conservation, full slots, HP, knockout, competing pickup, wanted timers and raids, both street entrances, cell capacity, access restrictions, aliases, offline avatars, restart and both puzzle-release modes.
- A SQLite database created by clean `main` at `8f6e310` was also reopened by the feature build. The fixture kept its 413.125 banked coins and all 95 food portions. Its nine slots held 81 portions and the recovery counter held 14.
- `tests/city-expansion.spec.mjs` uses the signup form, signed-in City link, a walk from Clock Square to the bank and arcade shop, keyboard movement, hotbar and shop in the 3D city. A second player opens the inmate’s profile through both the leaderboard and a match.
- `tests/cell-table.spec.mjs` signs in as a prisoner, checks the read-only dashboard, enters the cell through Casino, walks to the table, fits a piece and reopens it after a reload. It also checks timed custody and the missing-WebGL entrance.
- `tests/residential.spec.mjs` walks through houses and apartment floors and uses their furnishings in Chromium. The drawer checks put away and retrieve a carried item in both property types. `tests/city-render.spec.mjs` checks WebGL scene preparation and camera turns.

Run browser tests after the build with Playwright Chromium installed, for example `node --test --test-concurrency=1 tests/cell-table.spec.mjs tests/city-expansion.spec.mjs tests/city-render.spec.mjs tests/residential.spec.mjs`. The tests use fixture accounts. Puzzle completion and the longest sentences are exercised through the API and test clock. The browser walkthrough fits an individual piece and reloads its progress. Two checks also fail on clean `main` at `8f6e310`. The rankings notification test times out waiting for its casino win message, and the profile editor measures 777 px at a 768 px viewport.

The venue walkthrough lives in `tests/civic-venues.spec.mjs`. It uses the City link and ordinary movement from Clock Square, opens the police front desk, climbs to cell 50, returns down the stairs, visits the arcade counter and checks both exit locations. Both runs use WebGL 2, one with a desktop keyboard and one with a mobile touch joystick. The Royal Resort regression is `tests/royal-resort.spec.mjs`.

A second disposable SQLite fixture created with main at `6b42ee8` retained its existing login session, Inmate 01 alias, cell-relative position and facing, permanent moderation-only sentence, fitted jigsaw piece and 482.125 banked coins after migration and a second restart.

The [Civic Avenue screenshot review](review/civic-avenue/README.md) compares the running bank, police station, jail and arcade shop, as they appeared before the city became 3D-only.

## Reading the exchange floor displays

On the CAS, BNK, LOT and PRI floors, the share register and financial report face each other across the room. Walk up and use either display for a larger view. The register lists each holder, unsold inventory and your percentage of all issued shares.

CAS, BNK and PRI show today's net operating profit since Amsterdam midnight. LOT shows the current weekly draw's 1% share of ticket sales. The report shows reserves and estimates the total and your personal gross dividend using current earnings and holdings. Unsold shares receive no payout. CAS and BNK apply their dividend policies and cash limits, and PRI first deducts the inmate's debt obligations. The next scheduled distribution and the last total paid are shown in the report.

## Posting bail

Use the booking officer at Meridian Police to see inmate aliases, booking reasons and bail. The front desk gives directions. Paying from your banked coins releases the person immediately, including while they are offline. Timed bail uses the original sentence, rounded up to a whole coin. The five prices are 1, 4, 21, 125 and 500 coins. A releasable jigsaw sentence costs 1,000 coins. A moderation-only sentence has no bail option.

PRI records the entire bail payment as profit for the day and adds it to its next shareholder distribution. Earned custody income and any outstanding inmate loans follow the usual early-release rules. Older bookings show a generic reason when no original charge was recorded. Their prices use the saved custody term or, when no start is available, the time remaining at upgrade.
