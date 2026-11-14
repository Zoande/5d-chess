# The alternate dice table

This feature spends the player's merged Elo, not a mode-specific statistic. A winning face keeps all Elo and credits the complete quoted coin reward. A losing face removes only the chosen Elo and pays no coins. No profit tax or CasinoOwner transfer applies to Elo wagers. Ordinary coin wagers retain their existing rules and tax.

## Discovery and consent

The browser checks once after each completed ordinary dice throw. It requests an encounter after a loss leaves the wallet below the actual one-coin minimum, after 100 coin throws in the same page instance, or with probability 0.001% per throw. The page count resets on reload; eligibility and daily use do not. The client controls discovery, as intended; this is not an anti-cheat proof of 100 throws. The server gates every request using persisted eligibility and available Elo, and validates the broke condition against a real losing receipt and wallet.

An accepted request persists an offer and nonce. Only Yes/No keys remain. Refusal closes Elo wagers until the next Netherlands midnight. Accepting exposes the Elo table and smile, but does not place a wager. The offer explains the rating risk before consent. Reloads restore offered/active state. Rules include an option to return to coins, which also refuses further encounters for the day. A saved, settled throw must be finished first.

Stakes are whole numbers from 1 through the lesser of 100 and the player's integer Elo. The initial counter is unselected (0); +1, +10 and +50 wrap through the available range. Starting at 0, three +50 clicks produce 50, 100, 50. DEAL remains disabled at zero. Six faces remain equally likely; gestures and animations cannot change the cryptographic server result.

## Daily valuation, version 1

The server freezes a distribution snapshot at Dutch midnight, using `Europe/Amsterdam` and DST-aware reset helpers. Startup catches up after downtime; encounter requests also ensure that today's snapshot exists. The scheduler retries a temporarily busy database. No external cron or PM2 process is required.

The snapshot contains up to 201 evenly spaced rating quantiles from accounts with completed rated games. If none have played, all account ratings provide the initial distribution. Two fixed prior samples smooth very small populations. Account names are not stored in the snapshot.

For a point at Elo `e`, let `S(x) = 1 / (1 + exp(-x))` and compute:

```
p = (sum(S((e - sample) / 90)) + 2*S((e - 1200) / 220)) / (sample_count + 2)
skill = clamp((e - 600) / 600, 0, 5)
coin_price(e) = min(1000, 0.01 + 8 * skill^3 * (0.5 + p))
```

This produces a monotonic, smooth, bounded curve: very low ratings have little cash value, ordinary ratings yield several games' rewards for a substantial stake, and high ratings command much larger rewards. The absolute-rating term and priors keep a sparse population from producing extreme quantile jumps. The cap limits rewards to 100,000 coins per wager.

A stake of `n` prices exactly `n` separate points, beginning at `floor(current Elo)` and descending. Thus 1800 staking 50 prices 1800 through 1751, not 51 points. Sum full-precision point prices, then round the final reward to four decimal places. A loss subtracts the integer stake from the actual fractional rating. The client receives all available quotes in one response; the server recomputes its own quote and rejects changed days or ratings without settling the bet.

With sample ratings [900, 1100, 1200, 1200, 1300, 1500, 1800], a winning 50-Elo wager pays approximately 0.97 coins at 700 Elo, 322.90 at 1200, 4261.72 at 1800, and 10834.57 at 2200. These are examples, not permanent rates. The chance of winning is 1/6; a loss removes the stake.

## Transactions and midnight

Per-account state records day, allowed flag, offer, daily uses and lifetime Elo lost. Both wins and losses count towards ten wagers. The tenth settlement closes the alternate table; a saved throw is still presented before the client morphs back. Exhausting spendable Elo also returns to coins, without consuming any remaining daily allowance. At the next Dutch midnight the server logically resets allowance, uses and mode on access; lifetime loss remains. This avoids rewriting every account at midnight.

The account's existing casino sequence and request IDs cover coin and Elo bets. The Elo debit or coin payout, receipt, quota and lifetime totals commit atomically. Retries return the original receipt before checking current-day eligibility. The previous 100 mixed-currency casino receipts remain available for recovery. Concurrent tabs cannot bypass the cap or settle the same sequence twice. An open alternate offer prevents another tab from accidentally placing ordinary dice bets until the offer is resolved.

The SQLite metadata keys `eloGamblingValuation` and `eloGamblingLifetimeLost` hold the daily snapshot and total lifetime Elo removed across all accounts. Each account also retains its own lifetime total, available in the alternate table's Rules. No schema migration or tunnel change is needed.

Tests cover the daily curve, range summation, untaxed wins, losses, refusals, ten-round cap, stale quotes, low balances, DST, transaction rollback, reloads, lost responses, trigger probability, physical controls and mobile rendering.
