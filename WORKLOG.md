# WORKLOG — Crypto Casino (Vibe-Code Challenge)

Телеграфные записи по событиям: вехи, тупики, уроки, заметки по AI-инструментам.
Сырьё для README, Loom, AI-бонуса. Метки времени, без эссе.

## 2026-05-30 (День 1, Суббота)

- **~12:15 — веха: каркас собран и проверен.** Monorepo: `contracts/` (Foundry) + `web/` (Next.js).
- Окружение: Foundry уже стоял (forge 1.7.1, `~/.foundry/bin`). Неинтерактивный shell не подхватывал PATH из `.bashrc` → ложно показал «не установлен»; чиню явным `export PATH` в командах.
- Контракт: forge-std 1.16.1 + OpenZeppelin 5.6.1 (git submodules), Pyth `entropy-sdk-solidity` (npm) + `remappings.txt`. solc 0.8.28, evm cancun, optimizer 200. Канареечный контракт с импортами OZ+Pyth скомпилился → ремаппинги и версии валидны.
- Pyth Entropy на Base Sepolia: `0x41c9e39574F40Ad34c79f1C99B66A45eFB830d4c` (сверено по конфигу деплоев `pyth-network/pyth-crosschain` через `gh api`, не по памяти). API — V2.
- ⚠️ Для аудита/контракта: `requestV2()` без аргумента использует in-contract PRNG (нечестные validator+provider могут сговориться). Вариант `requestV2(provider, userRandomNumber, gasLimit)` усиливает гарантию — взвесить при написании ставки.
- Фронт: Next.js **16**.2.6 (не 15!) + React 19 + Tailwind v4 + shadcn (`base-nova`) + thirdweb 5.120. `create-next-app` сам предупреждает (`web/AGENTS.md`): Next 16 ломает привычные API — перед фронт-кодом читать `web/node_modules/next/dist/docs/`.
- ⚠️ web-зависимости: 25 moderate vulns (транзитивные web3). Тестнет — не блокер; `npm audit` при желании на полировке.
- AI-инструменты: стек сверял через context7 (доки Pyth/thirdweb) + WebSearch + `gh api` (адрес Entropy прямо из репозитория Pyth). Все load-bearing факты проверены до фиксации.
- **~12:40 — фикс по сверке с `read/base-sepolia.md`:** верификация переведена с устаревшего V1 Basescan на **Etherscan API V2** (ключ с etherscan.io, `api.etherscan.io/v2/api?chainid=84532`, переменная `ETHERSCAN_API_KEY`). V1 `api-sepolia.basescan.org` отключён 15.08.2025 — моя исходная конфигурация сломала бы верификацию. Синхронизированы foundry.toml, .env.example, DECISIONS.md, CLAUDE.md + поправлен устаревший `read/foundry.md`.
- ⚠️ Урок: read-pack не монолитен — `foundry.md` протух (и противоречил сам себе: «только ключ Etherscan» vs «ключ basescan.org»), `base-sepolia.md` актуален. Сверять источники между собой, не доверять одному файлу.
- **~13:00 — полная сверка read-pack (7 файлов) на противоречия.** On-chain подтверждено (`cast call` на Base Sepolia): Entropy жив, провайдер `0x6CC1…6344`, SDK реально `2.2.1`, `getFeeV2`≈1.5e13 wei (~0.000015 ETH). Исправлены V1-остатки верификации в `read/README.md` и `read/thirdweb.md` (внутренне противоречили). `pyth-entropy.md`: `receive()` не для рефанда — v2 излишек НЕ возвращает, слать ровно `getFeeV2()`. `thirdweb.md`: примеры на Vite → врезка про перенос на Next.js (`process.env.NEXT_PUBLIC_*`, `"use client"`).
- 📌 Зафиксировать при написании контракта: кран = «один claim на адрес» (DECISIONS), НЕ cooldown из примера OZ; выплата = pull-over-push (в колбэке только `balances[p]+=payout`, без внешнего перевода — иначе колбэк ревертит → PENDING); конвенция победы `result ≥ target` (не инверсная Stake `random ≤ target`); pragma 0.8.28; в `requestV2` слать ровно `getFeeV2()`.
