# Limbo — a provably-fair on-chain casino (Base Sepolia)

A crypto casino built for the **Vibe-Code Challenge** (48h, 30–31 May 2026). Solidity smart
contract + TypeScript/React frontend on the **Base Sepolia** testnet. The pitch in one line:
**every edge the house has, and every random number it rolls, is verifiable on-chain — so a
skeptic with a block explorer can confirm it isn't a scam.**

- **Live:** https://limbo-casino-five.vercel.app
- **Contract (verified):** [`0x8B8d552C384685afaC6C01E6524A3053eb308e54`](https://sepolia.basescan.org/address/0x8B8d552C384685afaC6C01E6524A3053eb308e54#code)
- **Randomness:** [Pyth Entropy](https://sepolia.basescan.org/address/0x41c9e39574F40Ad34c79f1C99B66A45eFB830d4c) (async request → callback)

---

## The product lens (this is a casino, read like a funnel)

A casino frontend lives or dies on two things: **conversion** (Visit → Registration → First
deposit → first bet) and **trust** (which drives retention). This build optimizes both, on purpose.

**Conversion — kill the friction.** The classic crypto onboarding (install a wallet, find a
faucet, get gas, approve a token, deposit) loses almost everyone. Here:

- **Login is email only.** One field. Behind it, thirdweb spins up a smart account (ERC-4337).
- **Gas is sponsored** (account abstraction paymaster). The player never needs Base Sepolia ETH
  for gas — which matters because that gas is genuinely hard to get on this testnet.
- **The game is visible before login.** No "connect your wallet" wall. One button, **"Войти и
  сыграть"** (*Log in and play*), runs the whole path — email login → free test funds from the
  faucet → first bet — in a single gesture, all gasless.
- **One balance.** The player sees a single number, **"Счёт казино"** (*Casino account*). The
  plumbing underneath (smart-account ETH vs. the contract's `balances[]` ledger, the Pyth fee,
  the deposit before each bet) is hidden — see [Account model](#account-model-one-balance) below.

**Trust — prove it, don't claim it.** Big casinos call themselves "provably fair" but the proof
is invisible. Here the house edge, the live hold, and **every individual roll** are recomputable
from chain state. That's the [Self-audit dashboard](#self-audit--unit-economics) and the
[Fairness verifier](#provable-fairness-the-hardest-part).

## Acceptance — what the brief requires, and how it's met

All four are verifiable on Basescan with no trust in me:

| Requirement | How |
| --- | --- |
| **Connect a wallet** | Email login → gasless smart account (thirdweb in-app wallet + AA). |
| **Deposit test tokens into the casino** | Faucet funds your account; the wallet→contract `deposit()` is executed automatically at bet time (one UserOp), so the on-chain deposit is real and visible — the player just sees their balance go up. |
| **Play and win or lose tokens** | Limbo: pick a target multiplier `T`; Pyth Entropy returns a random roll; `roll ≥ T` wins `stake × T`. |
| **Withdraw back to a wallet** | "Вывести на свой кошелёк" — paste any external address (MetaMask, an exchange); funds are sent there, gasless. |

Testnet only, no real money. The house always has an edge (1%), and that edge is transparent.

## Account model (one balance)

The single hardest *product* decision. A provably-fair casino with **asynchronous** randomness
(Pyth requests a number, then a second transaction delivers it via callback) **requires** the
player's funds to sit inside the contract between those two transactions — otherwise the callback
can't pay out or refund. That's the dominant pattern across on-chain casinos
(deposit → balance → bet → withdraw), and the brief itself asks for "deposit into the casino" and
"withdraw back".

So on-chain there are two pots: the smart account's native ETH (**W**) and the contract ledger
`balances[player]` (**G**). Showing the player both — plus an external address — was the original
UX failure ("too many accounts"). The fix, **entirely on the frontend, no contract redeploy**:

- **Display one number, "Счёт казино" = G + W.** That's what you bet with and what you withdraw.
- **Just-in-time funding.** On a bet, if G is short, the frontend silently bundles
  `deposit(stake − G)` + `placeBet` into **one gasless UserOp** (atomic, one confirmation). The
  Pyth fee is paid from W. Invariant guaranteed before `placeBet` runs: `G' ≥ stake`, `W' ≥ fee`.
- **Withdrawal = one outward path.** "Withdraw to your wallet" pastes an external address; if W is
  short it bundles `withdraw(amount − W)` + the native transfer. No third visible "account".

The word "wallet" is never applied to the hidden smart account; "smart account / AA / paymaster"
never appear in the UI. Login is email-only on purpose: thirdweb's in-app wallet derives a
**different address per auth method**, so offering Google *and* email would silently create two
different accounts with two balances.

## Self-audit & unit economics

The differentiator. A dashboard reads the contract live and speaks the language of casino
economics:

- **House edge (theory): 1.00%** — `RTP = 99%`, and the edge is baked into the distribution as
  `P(win) = RTP / T`. There is no hidden edge; this is the *only* one.
- **Actual hold** — `|wagered − paid| / wagered` over all settled bets, converging to 1% with
  volume. On a small sample players can be ahead; the dashboard shows that honestly.
- **Bank, reserve, volume, payouts, bet count, win rate** — all straight from chain state.

Plus a **live bet feed** (every `BetSettled` event, each row links to Basescan) — radical
transparency that a normal casino can't offer.

## Provable fairness (the hardest part)

**The hardest unknown was Pyth Entropy's asynchronous model.** Unlike a synchronous RNG, a bet is
*two* transactions: `placeBet` requests randomness; seconds later Pyth calls `entropyCallback`
with the number and the contract settles. Everything had to be designed around it:

- Funds are **locked** to reserve the full potential payout at request time (the bank can never be
  drained by an in-flight bet).
- The callback does **no external transfers** (pull-over-push) so it's cheap and can't revert — a
  reverting callback would strand the bet. An explicit `CALLBACK_GAS_LIMIT` (200k; measured usage
  73k) guarantees headroom, and `refundStuckBet` returns a bet if a callback never arrives.

**The verifier.** The contract records the outcome but doesn't emit the *raw* random number — so
the fairness panel closes the loop independently: it pulls `randomNumber` from **Pyth's own**
`Revealed` event by sequence number, recomputes the multiplier with the contract's public
`previewMultiplier`, and shows it matches the recorded `BetSettled`. The random number comes from
Pyth, not from the casino; the recompute is the casino's own on-chain function; a match proves the
outcome wasn't forged. Verified end-to-end (e.g. seq 56001: `0xf710d6…` → 25.15× recomputed ==
25.15× recorded).

## Stack & why

- **Network — Base Sepolia (L2, chainId 84532).** The brief says "Ethereum testnet
  (Sepolia/Holesky)". I chose Base because it's still Ethereum (an L2 settling to it), has Pyth
  Entropy deployed, the best AA/paymaster support for a gasless onboarding, and fast/cheap blocks —
  while Sepolia/Holesky L1 gas is even harder to source. The whole gasless funnel depends on this.
- **Contract — Solidity + Foundry.** Solidity is mandatory for an EVM contract and has the richest
  training data, so AI codegen is most reliable (fewer iterations, fewer tokens).
- **Frontend — TypeScript + Next.js 16 + thirdweb v5 + Tailwind/shadcn.** TS gives type safety at
  the contract boundary (ABI, addresses, `bigint`). thirdweb handles the in-app wallet, account
  abstraction, and gasless sponsoring out of the box on testnets.
- **Money — native test ETH + an in-contract faucet.** No token deploy, no `approve`, simplest
  possible deposit/withdraw loop.
- **Randomness — Pyth Entropy.** Verifiable on-chain, cheaper/faster than Chainlink VRF on Base,
  with a Foundry example to follow.

## What works / what doesn't

**Works (verified on-chain):**

- Full money loop: faucet → deposit → bet → win/lose → withdraw → send to an external address,
  **all gasless** (a player smart account with zero prior gas completed the entire path; 0
  gas-paying transactions on it — the paymaster covered everything).
- Async Pyth bet end-to-end on the real network; accounting invariant
  `balance == bank + faucet + locked + Σ balances` holds to the wei.
- Self-audit dashboard, live bet feed, and fairness verifier all read live chain state and work
  without a wallet connected.
- The revised UX (this submission) type-checks clean, renders clean (0 console errors), and the
  gasless "log in → auto-faucet → batched deposit+bet" cascade is wired.

**Not done / honest gaps:**

- The revised UX's **live email-login cascade** is the one path I can't automate headlessly (email
  OTP) — it's verified by rendering and types, and the underlying transactions are the same ones
  proven on-chain, but the end-to-end click-through on the new build is a manual pass.
- No redeploy, so `BetSettled` still doesn't emit the raw random number — the verifier bridges that
  via Pyth's event (see below).

## Accepted risks (from the final contract audit)

The contract passed an adversarial audit (multiple independent read-only Opus reviewers, two
rounds): no critical/high findings, funds provably safe, edge honest (RTP 98.94–99.00%, never
above 99%). Deliberately accepted, low-severity, documented rather than redeployed for:

- **Pyth trust model.** `requestV2()` is called without a `userRandomNumber`, so fairness rests on
  Pyth's validator + provider not colluding (the standard Entropy trust assumption). A
  user-contributed entropy variant would harden it; out of scope for the weekend.
- **Force-fed ETH is locked by design.** ETH sent directly to the contract (not via `deposit`)
  isn't withdrawable — it only ever makes the bank invariant a `>=`, never unsafe.
- **Hold stat and refunds.** `refundStuckBet` (the stuck-callback safety net) isn't subtracted from
  `totalWagered`, so the displayed hold can be slightly skewed by refunds.

## Run locally

```bash
# Contract (Foundry)
cd contracts
forge build && forge test            # 32 passing

# Frontend (Next.js)
cd web
npm install
npx next dev -p 3007                  # http://localhost:3007
```

`web/.env.local` needs `NEXT_PUBLIC_THIRDWEB_CLIENT_ID`, `NEXT_PUBLIC_CASINO_ADDRESS`,
`NEXT_PUBLIC_CHAIN_ID=84532` (see `web/.env.local` / `contracts/.env.example`). The production
build is compiled by Vercel on push to `main`.

## What I'd build next

- **Redeploy to emit `randomNumber` in `BetSettled`** — makes the fairness proof self-contained
  (no second Pyth event lookup).
- **Guest play + later email linking** — bet first, register on cash-out, to cut friction further.
- **A second game (Dice)** sharing the same bank/fairness rails.
- **User-contributed entropy** to remove the Pyth-collusion trust assumption.
- **An honest AI touch that moves a metric** (e.g. responsible-gaming nudge), not "AI for AI's sake".

---

## How I used AI tools

I treated Claude Code as an engineering workflow, not autocomplete: stress-test the plan before
writing code, verify every load-bearing decision against current docs, keep a clean commit history,
and adversarially review the money-handling contract before deploy.

- **`/grill-me`** — adversarially stress-tested the whole plan (game, chain, money model,
  randomness, toolchain) *before a single line of code*, and again before the UX revision. Killed
  weak choices early — including the "too many accounts" UX, which a hands-on playthrough exposed
  as not release-ready.
- **`/q`** — read-only verification subagents (own context, no write access). Each load-bearing
  decision was independently checked against current docs before being locked: the switch to Base
  Sepolia, that Pyth Entropy is live there, native-ETH-with-faucet over a custom token, that
  thirdweb derives a different address per auth method (→ email-only login).
- **`/git-commit`** — atomic, Conventional-Commits, domain-separated commits with no
  AI-attribution noise — the log you're reading.
- **Adversarial contract audit** — before deploy and before submission, Opus security-auditor
  subagents (read-only) audited the Solidity for reentrancy, fund-drain, bank/faucet isolation,
  house-edge math, and the async callback. Two rounds; one found a real callback-gas risk that I
  fixed before deploy.

What I deliberately did **not** do: heavyweight multi-agent orchestration or my `/research`
due-diligence skill. For a solo, tightly-coupled weekend build those cost several× the tokens for
no benefit — single agent plus targeted read-only subagents is the honest, economical choice. Where
AI genuinely struggled: Next.js 16 broke enough APIs that training data misled it (I pinned to the
in-repo docs), and headless tooling can't drive an email-OTP login, so the final live loop is a
human pass.
