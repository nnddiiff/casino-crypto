# Crypto Casino — Limbo (Base Sepolia)

Provably-fair, on-chain-verifiable crypto casino built for the Vibe-Code Challenge (30–31 May 2026). Solidity smart contract + TypeScript/React frontend on the Base Sepolia testnet.

> **Status: in progress.** The AI-workflow section below is final; the rest is filled during the build.

## How I used AI tools

I treated Claude Code as an engineering workflow, not autocomplete: stress-test the plan before writing code, verify every load-bearing decision against current docs, keep a clean commit history, and adversarially review the money-handling contract before deploy.

Custom Claude Code skills/commands I built, and how they shaped this build:

- **`/grill-me`** — adversarially stress-tested the whole plan (game, chain, money model, randomness source, toolchain) *before a single line of code*. Surfaced and killed weak choices early.
- **`/q`** — read-only verification subagents (own context, no write access). Each load-bearing decision was independently checked against current documentation before being locked. This caught the switch to Base Sepolia, confirmed Pyth Entropy is live there, and validated native-ETH-with-faucet over a custom token.
- **`/git-commit`** — atomic, Conventional-Commits, domain-separated commits with a clean history and no AI-attribution noise — the log you're reading.
- **Adversarial contract audit** — before deploy, an Opus security-auditor subagent (read-only) audits the Solidity for reentrancy, fund-drain, bank/faucet isolation, and house-edge math.

What I deliberately did **not** do: spin up multi-agent orchestration or my heavier `/research` due-diligence skill. For a solo, tightly-coupled weekend build those cost 3–7× the tokens and add coordination overhead for no benefit — single-agent plus targeted subagents is the honest, economical choice.

## What it is

*(to be completed)*

## Live demo & on-chain verification

- **Contract (Base Sepolia, verified):** [`0x8B8d552C384685afaC6C01E6524A3053eb308e54`](https://sepolia.basescan.org/address/0x8b8d552c384685afac6c01e6524a3053eb308e54#code)
- **Provable randomness:** Pyth Entropy, async request → callback. Каждую ставку можно проверить on-chain по `sequenceNumber`; множитель пересчитывается из случайного числа функцией `previewMultiplier`.
- **Sanity-проверка end-to-end:** ставка `sequenceNumber 55986` (2.00x) — выигрыш, выплата начислена, учёт сошёлся.
- **Live URL:** *(to be completed — Vercel)*

## Run locally

*(to be completed)*

## Stack & why

*(to be completed — why Base/Ethereum, Solidity + TypeScript, Pyth Entropy, native ETH + in-contract faucet)*

## What works / what doesn't

*(to be completed)*

## Hardest unknown & how I solved it

*(to be completed — provable fairness via Pyth Entropy's async request→callback model)*

## What I'd build next

*(to be completed)*
