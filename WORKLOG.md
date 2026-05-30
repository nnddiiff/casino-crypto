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
