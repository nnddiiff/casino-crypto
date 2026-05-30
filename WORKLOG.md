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

## (H1–H7) Контракт-ядро

- **~14:00 — веха: `LimboCasino.sol` написан и протестирован, 27/27 forge-тестов зелёные.** `forge build` чистый (0 warning), размер 5.8 KB (лимит 24.6 KB).
- Реализовано: deposit/withdraw (pull-over-push, CEI, nonReentrant); кран (один claim на адрес); `placeBet` с резервом полной выплаты в `locked` (банк не разорить одной ставкой); колбэк Pyth с расчётом исхода без внешних переводов (дёшев → не PENDING); edge-математика (множитель из randomNumber ×0.99, cap 10000x); раздельный учёт `casinoBank`/`faucetPool`/`balances`/`locked`; view для дашборда (`houseEdgeBps`/`holdBps`/`entropyFee`/`previewMultiplier`); админ (`fundBank`/`fundFaucet`/`withdrawHouse`).
- Инвариант `balance == bank+faucet+locked+Σbalances` проверяется в каждом сценарии + fuzz на диапазон множителя. Деплой-скрипт `script/Deploy.s.sol` готов.
- ⚠️ Уроки: (1) `forge-lint` поймал divide-before-multiply в формуле множителя — переписал умножения до делений; (2) ловушка `vm.expectRevert` — внешний вызов в аргументах считается «следующим вызовом», выносить в локальную переменную до expectRevert.
- Дальше: гейт безопасности — независимый adversarial-аудит контракта субагентом (Opus, Read/Grep) перед деплоем.

- **~14:30 — гейт безопасности (слот 1): два независимых adversarial-аудитора (Opus, read-only, чеклист `solidity-security`), разные линзы (средства/учёт и логика/Pyth/арифметика).**
- ✅ Критичного нет: средства не слить, чужой баланс недоступен, банк защищён резервом+cap, reentrancy закрыт (CEI+nonReentrant), access control корректен (`withdrawHouse` не трогает locked/balances), инвариант учёта держится в штатных путях. Колбэк защищён от подмены/двойного/неизвестного seq.
- ✅ Edge ЧЕСТЕН — auditor-logic перебрал все 2^24 исхода: `P(win)·T` = RTP 98.99–99.00% во всём диапазоне, двойного учёта нет, модульного смещения нет, отклонения в пользу игрока (на хвосте 10000x cap даёт +0.05% казино).
- ⚠️ **[HIGH] (консенсус обоих):** async-колбэк Pyth. Реальный Entropy при реверте/нехватке газа колбэка НЕ откатывает tx — ставит статус `CALLBACK_FAILED` (сверено по SDK). `requestV2()` зовётся без явного gasLimit (дефолтный провайдера), колбэк ~6 storage-записей → дефолта может не хватить → ставка навсегда `settled=false`, `potentialPayout` заморожен в `locked`, пути возврата нет. Это и есть риск гейта ~14:00.
- ⚠️ **[MEDIUM]:** `MockEntropy` вызывает колбэк напрямую (реверт прокидывается, тест падает), а реальный Pyth реверт глотает — зелёные тесты маскируют HIGH. **[LOW]:** `receive()` ломает строгое равенство инварианта (важно для дашборда честности).
- 📌 Фикс перед деплоем: (1) явный `gasLimit` в `requestV2(gasLimit)` + `getFeeV2(gasLimit)`; (2) возврат зависшей ставки по таймауту (stake игроку, резерв в банк, `settled`); (3) мок с `CALLBACK_FAILED` + тесты сбоя/возврата; (4) убрать `receive()` либо инвариант как `>=`. Затем повторный прогон.

- **~15:00 — findings аудита закрыты; повторный прогон зелёный (32/32, build без warning).**
  - HIGH-газ: `requestV2(CALLBACK_GAS_LIMIT=200_000)` + `getFeeV2(200k)`. Замер gas-report: колбэк = **22 166 газа** → ×9 запас, отказ колбэка по газу исключён.
  - HIGH-возврат: `refundStuckBet(seq)` — permissionless, по `STUCK_TIMEOUT=1ч` возвращает ставку игроку и резерв в банк (ничья), `settled=true` блокирует поздний колбэк. +5 тестов.
  - MEDIUM: `MockEntropy.fireCallbackCatching` (try/catch как реальный Pyth) + тесты сбоя/возврата/позднего колбэка.
  - LOW: убран `receive()`; инвариант учёта в docstring → `>=` (только force-feed).
  - Дальше: деплой на Base Sepolia (реальный end-to-end колбэк = настоящая проверка гейта ~14:00, нужны ключи); финальный аудит (slot 2) перед сдачей.

## (H8) Деплой + верификация + живой колбэк

- **~15:30 — задеплоен на Base Sepolia, верифицирован, проверен end-to-end.**
- Контракт: `0x8B8d552C384685afaC6C01E6524A3053eb308e54`, owner `0x89AC…E119`. Верификация Basescan: **Pass**. Засижено: банк 0.4 / кран 0.1 ETH.
- ✅ **Гейт ~14:00 пройден на РЕАЛЬНОЙ сети:** deposit 0.02 → `placeBet(2x, 0.01)` → колбэк Pyth (seq **55986**) пришёл за ~секунды → выигрыш (result ≥ 2x), payout 0.02 начислен, `betsTotal=1`, `betsWon=1`, `locked` вернулся в 0.
- ✅ Инвариант учёта сходится ТОЧНО on-chain: `balance == bank+faucet+locked+Σbalances` = 520984999999999999 wei.
- Ядро де-рисковано: реальный async-колбэк Pyth работает с контрактом. Дальше — фронт (петля в UI) + дашборд самоаудита.

## (Фронт) Чекпоинты 1–2 — каркас и петля средств

- **~17:30 — веха: фронт-каркас и петля средств работают на реальном контракте.** Next.js 16 + thirdweb v5.
- Чекпоинт 1 (каркас): провайдер thirdweb (`lib/client`/`chain`/`contract`), тёмная тема charcoal + неон-зелёный (#00e701), `ConnectButton` (встроенный кошелёк + MetaMask, сеть Base Sepolia). Проверено через playwright-MCP: сборка Turbopack чистая (Ready ~230ms), консоль без ошибок, модалка подключения показывает оба кошелька.
- Чекпоинт 2 (деньги): панель средств — кран → депозит → вывод. Хук `use-tx` (отправка + `waitForReceipt` + тосты sonner), `use-casino` (чтения `balances`/`faucetClaimed`/`faucetPool`/`entropyFee`).
- ✅ Петля денег подтверждена on-chain (Basescan txlist owner): `claimFaucet` (nonce 5), `deposit` 0.01 (nonce 6), `withdraw` 0.005 (nonce 7) — все success. Игровой баланс сходится до wei: 0.030985 + 0.01 − 0.005 = 0.035985.
- ⚠️ Урок: гигантский ABI как `export const … as const` в `.ts` ломает парсер Turbopack/SWC (`Expected ';'…`). Решение: ABI в `getContract` не передаём, все вызовы — полными сигнатурами методов/событий. Canonical ABI — в `contracts/out` и на Basescan.
- ⚠️ Окружение: `localhost:3000` занят Grafana → dev на 3007; `npm`/`npx` переписывается хуком (RTK) → `next` запускать через `./node_modules/.bin/next`.
- Дальше: чекпоинт 3 — ставка Limbo (async `placeBet` → `BetSettled`), анимация множителя.

## (Фронт) Чекпоинт 3 — ставка Limbo + дашборд самоаудита

- **~18:00 — чекпоинт 3: асинхронная ставка работает end-to-end.** `placeBet` (value = `entropyFee`) → `seq` из `BetPlaced` → ожидание `BetSettled` → результат. Цифра множителя «крутится» в ожидании колбэка.
- ✅ Проверено on-chain + в UI: ставка 2.00× / 0.001 ETH (seq 55993) проиграла (выпало 1.58×), `betsTotal` 1→2, игровой баланс −0.001. Колбэк Pyth пришёл за секунды.
- ⚠️ Урок: ожидание колбэка — polling `getContractEvents` от блока ставки + фильтр по `seq` в JS (topic-фильтр по `uint64 indexed` ненадёжен).
- ⚠️ Урок: Basescan индексирует tx с задержкой (~10 с) → пруф-ссылку увёл с tx ставки на страницу контракта `#events` (всегда доступна, виден и `BetSettled`).
- **~18:30 — дашборд самоаудита (дифференциатор).** Публичные view (`houseEdgeBps`/`holdBps`/`totalWagered`/`totalPaidOut`/`betsTotal`/`betsWon`/`casinoBank`) без кошелька — виден до подключения. Edge 1% (теория) против фактического hold + банк + ссылка на events.
- Ядро + дифференциатор готовы. Дальше: полировка (состояния, тексты, бренд, мобильный адаптив), README/Loom, деплой на Vercel.

## (Деплой фронта) Vercel — live URL

- **~20:00 — фронт задеплоен на Vercel, петля проверена на боевом URL.** Live: **https://limbo-casino-five.vercel.app**
- Прод-сборка `next build` (Turbopack) собралась за 8 с — риск node-зависимостей thirdweb НЕ материализовался. Единственный фикс: `tsconfig target ES2017 → ES2020` (bigint-литералы `0n`; dev на Turbopack type-check не делал, поймал только `next build`).
- Деплой через vercel CLI: `link` (проект `limbo-casino`) + `git connect` (автодеплой на push в `main`) + 3 публичные `NEXT_PUBLIC_*` env (production+preview+development) + Root Directory=`web` (monorepo, через Vercel API `PATCH /v9/projects`). Push → автосборка READY за ~70 с.
- ✅ Петля на боевом URL: 3 ставки 2.00×/0.001 (выиграли, `betsTotal` 2→5), вывод 0.01 — баланс сошёлся on-chain. Дашборд читает контракт на проде, env вшились, 0 ошибок в консоли.
- ⚠️ Грабли деплоя: (1) Bash-песочница гонит сеть через прокси, vercel CLI (Node) его не уважает → vercel-команды только с отключённой песочницей; (2) `git connect` требует установленного Vercel GitHub App с доступом к репо (не только OAuth-вход — отсюда `account_not_found`/зацикливание логина: нужен был Sign Up + установка App); (3) Root Directory monorepo не ставится при link из подпапки — задан через API; (4) `git connect` ищет `.git` в cwd → передавать URL репо явно.

## (Гейт безопасности) slot 2 — финальный adversarial-аудит

- **~21:00 — slot 2 пройден: research-методология + 4 независимых аудитора (Opus, read-only) по линзам. Контракт не менялся (byte-identical).**
- **Вердикт: CRITICAL/HIGH нет, контракт к сдаче, редеплой НЕ нужен.**
- ✅ Средства (A/D/E): инвариант держится (fuzz 50k); `withdrawHouse` не трогает `locked`/`balances`/`faucet` (доказано с `locked>0` — игрок выводит выигрыш даже после опустошения банка владельцем); CEI/reentrancy чисты; `potentialPayout ≥ stake` → `refundStuckBet` без underflow.
- ✅ Edge честен (C): RTP 98.94–99.00%, максимум ровно 99/100 (точная рацио-арифметика); целей с RTP>99% нет; все искажения (cap/floor/округление) в пользу казино; модульного смещения нет.
- ✅ Async/Pyth (B/F): задвоение и гонка `refund↔поздний колбэк` закрыты гардом `settled`; колбэк не ревертит на штатном пути (fuzz 256); газ колбэка 73k(win)/28k(lose) из 200k → **запас 170%** (HIGH slot 1 закрыт с большим запасом, подтверждено на верном gas-limited моке). DoS банка отсекается `BankCannotCover`; faucet Sybil не трогает банк.
- ✅ Задеплоенный байткод соответствует исходнику (constructor-args, сиды банк 0.4/кран 0.1 сверены on-chain).
- 📌 Находки LOW/INFO (редеплой не требуется): (1) **[LOW]** `BetSettled` не эмитит сырой `randomNumber` — пруф честности неполон, закрывается фронтом (экран-верификатор по событию Pyth `Revealed`); (2) trust-модель Pyth (`requestV2` без `userRandomNumber` → доверие валидатор+провайдер) — раскрыть в README; (3) `refundStuckBet` искажает hold-статистику дашборда — README/опц. `totalWagered -= stake`; (4) force-fed ETH заперт by design — упомянуть в README; (5) тест-мок не похож на Pyth (plain-call без gasLimit) — сьют слаб как доказательство, но контракт безопасен по прямым пробам; опц. постоянный gas-limited мок + газовый регресс-тест.
- ⚠️ Урок: read-only аудиторы (тип `security-auditor`, tools=All) создавали временные `*.t.sol` в `contracts/test/`, один не компилировался и ронял весь `forge test`. Почистил, боевой сьют 32/32. Впредь — пробы аудиторов в `/tmp`.

## (Фронт) Верификатор честности — закрытие находки аудита slot 2

- **~22:30 — экран-верификатор честности готов и проверен в браузере. Контракт НЕ трогали (редеплой не нужен).**
- Закрывает [LOW] slot 2: наш `BetSettled` не публикует сырой `randomNumber`, поэтому пруф замыкается через независимое событие Pyth `Revealed` по seq → `previewMultiplier(randomNumber)` → сверка с записанным `resultMultiplier`. Панель видна без кошелька (инструмент скептика «не верь — проверь»).
- ✅ Проверено end-to-end (Playwright, seq 56001, без кошелька → путь поиска по таймстампу): `randomNumber` `0xf710d6…0a13f2` → пересчёт **25.15×** == запись **25.15×**, цель 2.00× · выигрыш. Ссылка ведёт на верную tx расчёта. Неизвестный seq → аккуратное «не найдена». Build/tsc/консоль чисто (0 ошибок, 0 warning).
- 🔬 Разведка on-chain до кода: Pyth на Base Sepolia эмитит **V2 `Revealed`** (topic0 `0x2231…ed47`), seq — indexed (topic3), `randomNumber` — первое поле data; и Pyth `Revealed`, и наш `BetSettled` лежат в **одной транзакции** колбэка (та же tx/блок).
- ⚠️ Грабли: thirdweb **Insight домен-ограничен** (client-id не авторизован для боевого домена и localhost → 401), а `getContractEvents` по умолчанию `useIndexer:true` → в проде каждый запрос бьётся в Insight, падает и откатывается на RPC (лишний round-trip + warning). Верификатору задал `useIndexer:false` — прямой RPC, без шума.
- ⚠️ Грабли: RPC `eth_getLogs` жёстко режет окно до **1000 блоков** (-32005). Слепой скан по seq не годится → для ставки сессии беру точный блок колбэка (из `waitForSettlement`), для произвольного seq якорюсь по `bets.requestedAt` (~2 c/блок) и просматриваю несколько окон ≤1000.
- Адрес Pyth — константа с env-override (`NEXT_PUBLIC_ENTROPY_ADDRESS`), прод не зависит от новой переменной. Блок деплоя контракта (42186691) — нижняя граница поиска.
- Дальше: README (раскрыть верификатор + принятые риски slot 2), Loom; опц. полировка (бренд, мобильный адаптив).
