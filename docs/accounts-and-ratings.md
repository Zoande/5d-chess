# Development accounts and ratings

The development frontend and Node API must be deployed together. Main is unchanged. Build with `npm run build`, then restart the Node process with the same `DATA_DIR`; back up `multiplayer.json` before upgrading. See [Collections and economy](collections.md) for coins, spins, crates, inventory and the market.

## Flow

Guests land on the four-player local board. Authenticated users land on Home. Online/Local, player count and movement determine Find/Play and Continue. Create has its own details screen; Find uses a two-column invite/open-games layout, with filtering and a Show all option. Private invite codes lead to a password form. The AI button remains disabled.

Every page shares the logo, coin balance, Shop / Inventory / Market navigation and account menu. Settings stores default player count, default movement and notification preferences. Owned player icons and per-piece skins are equipped in inventory. Local games remain browser saves. The canvas and match controls keep their existing behavior.

## Merged Elo

One visible rating starts at 1200 and covers all movement modes and player counts. Every newly created online game is Elo-eligible, including private games. Local games are not eligible. The first ten games are labeled provisional, without changing K. Development accounts receive the new merged rating without converting old pool ratings.

Duels use standard pairwise logistic Elo with K = 32 and a 400-point scale. Multiplayer uses normalized pairwise comparisons with a total K of 40: K = 34 (85%) for finishing order and K = 6 (15%) for elimination performance. Elimination performance compares credited elimination totals between each pair. If nobody earns elimination credit, finishing order gets the full K = 40. Changes are balanced to sum to zero after integer rounding. Thus a four-player match does not multiply the available rating swing by three.

Finishing later wins a placement comparison; elimination in the same resolution ties. Surviving winners finish above eliminated players. First king captures in the elimination resolution credit the attacking faction; multiple attackers share one elimination credit. Capturing multiple historical king copies does not multiply that credit. Mutual king collisions can credit both factions. Checkmate is not inferred.

Ratings are frozen when every seat fills. At completion (at most one survivor), each change is added to that account’s current rating, and the game settles once. Concurrent games have independent frozen starting ratings. Room results, changes, coins and the settled marker persist together. Finishing order is the principal multiplayer signal; second place can gain or lose depending on opponent strengths and elimination contribution.

The four mode/count pools remain server-side statistics. They are updated with placement Elo, but are not returned in public profiles or exposed in navigation, rating controls or the leaderboard. The visible leaderboard uses only merged Elo and includes accounts that have completed a rated game. Empty pools and fake placeholder players are not shown.

## Notifications and persistence

The server stores the latest 100 in-app notices per account: joins, submitted plans, resolved rounds, turns, results and rating changes. Rating notices include earned game coins. Pending Live-plan notices never reveal the orders. Clicking a notice marks it read and opens its game; mark-all-read is available on Home and the full feed. Disabling move notices suppresses joins, moves and turns while retaining results and rating changes.

Pages poll while visible. Notifications, preferences, ratings and economy data survive server restarts in the existing database. Account APIs require authentication, and only the owner can update notification read state or use their inventory. There are no email or operating-system notification integrations.
