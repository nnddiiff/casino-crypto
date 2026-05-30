// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { IEntropyV2 } from "@pythnetwork/entropy-sdk-solidity/IEntropyV2.sol";
import { IEntropyConsumer } from "@pythnetwork/entropy-sdk-solidity/IEntropyConsumer.sol";

/// @title LimboCasino — доказуемо честное on-chain казино Limbo на Base Sepolia.
/// @notice Игрок задаёт целевой множитель T; Pyth Entropy присылает случайное число
///         второй транзакцией (request -> callback); выпавший множитель сравнивается с T:
///         result >= T -> выигрыш, выплата = ставка * T. Единственное преимущество казино —
///         зашитый в распределение edge (RTP 99%, P(win) = RTP/T), он прозрачен и проверяем.
///
/// @dev Инварианты, которые держит контракт:
///      1. Раздельный учёт: casinoBank (выплаты) != faucetPool (кран) != balances (игроки) != locked (резерв ставок).
///         address(this).balance >= casinoBank + faucetPool + locked + sum(balances)
///         (строгое равенство во всех штатных путях; >= лишь из-за возможного force-feed ETH извне).
///      2. Под каждую неразыгранную ставку резервируется полная выплата в `locked` — банк не разорить.
///      3. Деньги отдаются только через pull-over-push (withdraw/claim); в колбэке Pyth — никаких внешних переводов.
///      4. checks-effects-interactions + nonReentrant на всех функциях, отдающих ETH.
contract LimboCasino is Ownable, ReentrancyGuard, IEntropyConsumer {
    // --- Экономика игры (константы) ---
    uint256 public constant SCALE = 1e6; // фикс. точка множителя: T=2.00x -> 2_000_000
    uint256 public constant RTP_BPS = 9900; // RTP 99.00% в базисных пунктах
    uint256 public constant BPS = 10_000; // делитель базисных пунктов
    uint256 public constant SPACE = 16_777_216; // 2^24 — диапазон случайного числа (как у Stake)
    uint256 public constant MAX_MULTIPLIER = 10_000 * SCALE; // hard cap выигрыша (как Hacksaw): защита банка
    uint256 public constant MIN_MULTIPLIER = 1_010_000; // нижняя граница цели 1.01x (~98% шанс)
    uint256 public constant MIN_BET = 1e13; // минимальная ставка 0.00001 ETH
    uint256 public constant FAUCET_AMOUNT = 5e15; // выдача крана 0.005 ETH за claim

    // --- Параметры запроса случайности ---
    uint32 public constant CALLBACK_GAS_LIMIT = 200_000; // явный лимит газа колбэка Pyth (с запасом под storage-записи)
    uint256 public constant STUCK_TIMEOUT = 1 hours; // после этого неразыгранную ставку можно вернуть (страховка от сбоя колбэка)

    // --- Источник проверяемой случайности ---
    IEntropyV2 private immutable _entropy;

    // --- Учёт средств (строго раздельный) ---
    uint256 public casinoBank; // свободная ликвидность дома
    uint256 public faucetPool; // отдельный пул крана
    uint256 public locked; // зарезервировано под неразыгранные ставки
    mapping(address => uint256) public balances; // игровой баланс игрока (pull-over-push)
    mapping(address => bool) public faucetClaimed; // один claim крана на адрес

    // --- Статистика для дашборда самоаудита ---
    uint256 public totalWagered; // сумма всех ставок
    uint256 public totalPaidOut; // сумма выплат игрокам (payout при выигрыше)
    uint256 public betsTotal; // число разыгранных (settled) ставок
    uint256 public betsWon; // число выигрышных

    // --- Ставки в процессе (request -> callback) ---
    struct Bet {
        address player;
        uint256 stake;
        uint256 target;
        uint256 potentialPayout;
        bool settled;
        uint64 requestedAt; // время запроса — для возврата зависшей ставки по таймауту
    }

    mapping(uint64 => Bet) public bets; // sequenceNumber Pyth -> ставка

    // --- События (фронт матчит request/settle по sequenceNumber) ---
    event Deposited(address indexed player, uint256 amount, uint256 newBalance);
    event Withdrawn(address indexed player, uint256 amount);
    event FaucetClaimed(address indexed player, uint256 amount);
    event BankFunded(uint256 amount, uint256 newBank);
    event FaucetFunded(uint256 amount, uint256 newPool);
    event HouseWithdrawn(uint256 amount);
    event BetPlaced(
        uint64 indexed sequenceNumber, address indexed player, uint256 stake, uint256 target
    );
    event BetSettled(
        uint64 indexed sequenceNumber,
        address indexed player,
        uint256 resultMultiplier,
        uint256 target,
        bool won,
        uint256 payout
    );
    event BetRefunded(uint64 indexed sequenceNumber, address indexed player, uint256 stake);

    // --- Ошибки ---
    error ZeroAmount();
    error InsufficientBalance();
    error InvalidTarget();
    error BetTooSmall();
    error InsufficientEntropyFee();
    error BankCannotCover();
    error FaucetAlreadyClaimed();
    error FaucetEmpty();
    error TransferFailed();
    error UnknownOrSettledBet();
    error BetNotStuck();

    constructor(address entropyContract, address initialOwner) Ownable(initialOwner) {
        _entropy = IEntropyV2(entropyContract);
    }

    // ============================================================
    // Игрок: депозит / вывод / кран
    // ============================================================

    /// @notice Внести нативный ETH на игровой баланс.
    function deposit() external payable {
        if (msg.value == 0) revert ZeroAmount();
        balances[msg.sender] += msg.value;
        emit Deposited(msg.sender, msg.value, balances[msg.sender]);
    }

    /// @notice Вывести часть игрового баланса обратно на кошелёк (pull-over-push + CEI + nonReentrant).
    function withdraw(uint256 amount) external nonReentrant {
        uint256 bal = balances[msg.sender];
        if (amount == 0) revert ZeroAmount();
        if (amount > bal) revert InsufficientBalance();

        balances[msg.sender] = bal - amount; // EFFECTS до перевода

        (bool ok,) = payable(msg.sender).call{ value: amount }(""); // INTERACTIONS
        if (!ok) revert TransferFailed();
        emit Withdrawn(msg.sender, amount);
    }

    /// @notice Получить тестовый ETH из крана на кошелёк. Один claim на адрес.
    function claimFaucet() external nonReentrant {
        if (faucetClaimed[msg.sender]) revert FaucetAlreadyClaimed();
        if (faucetPool < FAUCET_AMOUNT) revert FaucetEmpty();

        faucetClaimed[msg.sender] = true; // EFFECTS до перевода
        faucetPool -= FAUCET_AMOUNT;

        (bool ok,) = payable(msg.sender).call{ value: FAUCET_AMOUNT }(""); // INTERACTIONS
        if (!ok) revert TransferFailed();
        emit FaucetClaimed(msg.sender, FAUCET_AMOUNT);
    }

    // ============================================================
    // Игрок: ставка Limbo (асинхронная — request -> callback)
    // ============================================================

    /// @notice Сделать ставку Limbo. Списывает stake с игрового баланса и запрашивает случайность у Pyth.
    /// @param target целевой множитель в фикс. точке x1e6 (2.00x -> 2_000_000), [MIN_MULTIPLIER; MAX_MULTIPLIER].
    /// @param stake размер ставки в wei (из игрового баланса).
    /// @dev msg.value обязан покрыть комиссию Pyth getFeeV2(); излишек зачисляется на баланс игрока.
    ///      Под потенциальную выплату резервируется ликвидность банка (locked) — выплата гарантирована.
    function placeBet(uint256 target, uint256 stake) external payable nonReentrant {
        // --- CHECKS ---
        if (target < MIN_MULTIPLIER || target > MAX_MULTIPLIER) revert InvalidTarget();
        if (stake < MIN_BET) revert BetTooSmall();
        if (balances[msg.sender] < stake) revert InsufficientBalance();

        uint128 fee = _entropy.getFeeV2(CALLBACK_GAS_LIMIT);
        if (msg.value < fee) revert InsufficientEntropyFee();

        uint256 potentialPayout = stake * target / SCALE;

        // --- EFFECTS ---
        balances[msg.sender] -= stake; // ставка уходит из баланса игрока
        casinoBank += stake; // ...и входит в банк
        if (casinoBank < potentialPayout) revert BankCannotCover(); // банк обязан покрыть выплату
        casinoBank -= potentialPayout; // резерв полной выплаты
        locked += potentialPayout;

        uint256 surplus = msg.value - fee; // излишек ETH сверх комиссии — не теряем
        if (surplus > 0) balances[msg.sender] += surplus;

        totalWagered += stake;

        // --- INTERACTIONS --- единственный внешний вызов; sequenceNumber известен только после него.
        // Явный gasLimit: колбэк обязан уложиться, иначе Pyth пометит CALLBACK_FAILED и ставка зависнет.
        uint64 seq = _entropy.requestV2{ value: fee }(CALLBACK_GAS_LIMIT);

        bets[seq] = Bet({
            player: msg.sender,
            stake: stake,
            target: target,
            potentialPayout: potentialPayout,
            settled: false,
            // forge-lint: disable-next-line(block-timestamp)
            requestedAt: uint64(block.timestamp)
        });
        emit BetPlaced(seq, msg.sender, stake, target);
    }

    // ============================================================
    // Колбэк Pyth: расчёт исхода. Без внешних переводов (pull-over-push) -> колбэк дёшев и не ревертит.
    // ============================================================

    /// @dev Вызывается только контрактом Entropy (проверка msg.sender зашита в IEntropyConsumer._entropyCallback).
    function entropyCallback(
        uint64 sequenceNumber,
        address,
        /*provider*/
        bytes32 randomNumber
    )
        internal
        override
    {
        Bet storage bet = bets[sequenceNumber];
        if (bet.player == address(0) || bet.settled) revert UnknownOrSettledBet();

        bet.settled = true; // EFFECTS first
        betsTotal += 1;

        uint256 result = _multiplierFrom(randomNumber);
        bool won = result >= bet.target;
        uint256 payout = 0;

        if (won) {
            payout = bet.potentialPayout;
            balances[bet.player] += payout; // начисляем на баланс (игрок заберёт через withdraw)
            locked -= payout;
            totalPaidOut += payout;
            betsWon += 1;
        } else {
            casinoBank += bet.potentialPayout; // резерв возвращается в свободный банк
            locked -= bet.potentialPayout;
        }

        emit BetSettled(sequenceNumber, bet.player, result, bet.target, won, payout);
    }

    /// @dev Адрес Entropy для проверки отправителя колбэка.
    function getEntropy() internal view override returns (address) {
        return address(_entropy);
    }

    /// @notice Вернуть зависшую ставку, если колбэк Pyth не пришёл за STUCK_TIMEOUT (страховка от CALLBACK_FAILED).
    /// @dev Ничья: ставка возвращается игроку, резерв — в банк. Permissionless. Защита от гонки: settled=true,
    ///      поэтому поздний колбэк будет отвергнут (UnknownOrSettledBet). Без внешних переводов — pull-over-push.
    function refundStuckBet(uint64 sequenceNumber) external {
        Bet storage bet = bets[sequenceNumber];
        if (bet.player == address(0) || bet.settled) revert UnknownOrSettledBet();
        // block.timestamp безопасен: таймаут 1 час устойчив к дрейфу времени майнера (секунды).
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp < bet.requestedAt + STUCK_TIMEOUT) revert BetNotStuck();

        bet.settled = true; // EFFECTS first — закрывает ставку и блокирует поздний колбэк
        locked -= bet.potentialPayout; // освобождаем резерв
        casinoBank += bet.potentialPayout; // ...возвращаем его в банк
        casinoBank -= bet.stake; // ...и возвращаем ставку игроку (potentialPayout >= stake, минуса нет)
        balances[bet.player] += bet.stake;

        emit BetRefunded(sequenceNumber, bet.player, bet.stake);
    }

    // ============================================================
    // Математика множителя — чистая и проверяемая (тот же приём, что у Stake)
    // ============================================================

    /// @dev result = (2^24 / n) * RTP, n in [1; 2^24]. Множитель x1e6. RTP=0.99 — зашитый edge.
    function _multiplierFrom(bytes32 randomNumber) internal pure returns (uint256) {
        uint256 n = (uint256(randomNumber) % SPACE) + 1; // n in [1; 2^24]
        // x0.99 (RTP) — edge в распределении. Умножения до делений: меньше потери точности.
        uint256 result = SPACE * SCALE * RTP_BPS / BPS / n;
        if (result > MAX_MULTIPLIER) result = MAX_MULTIPLIER; // cap, защита банка
        if (result < SCALE) result = SCALE; // минимум 1.00x
        return result;
    }

    /// @notice Публичный пересчёт множителя из случайного числа — для пруфа на дашборде/верификаторе.
    function previewMultiplier(bytes32 randomNumber) external pure returns (uint256) {
        return _multiplierFrom(randomNumber);
    }

    // ============================================================
    // Дашборд самоаудита (view)
    // ============================================================

    /// @notice Текущая комиссия Pyth за один запрос ставки (wei) — под наш gasLimit колбэка.
    function entropyFee() external view returns (uint256) {
        return _entropy.getFeeV2(CALLBACK_GAS_LIMIT);
    }

    /// @notice Преимущество казино в б.п. (константа игры): 10000 - RTP = 100 б.п. = 1%.
    function houseEdgeBps() external pure returns (uint256) {
        return BPS - RTP_BPS;
    }

    /// @notice Фактический hold на выборке ставок: |ставки - выплаты| / ставки в б.п.
    /// @return houseAhead true — казино в плюсе, false — игроки в плюсе (бывает на малой выборке).
    /// @return magnitudeBps модуль hold в б.п.; сходится к houseEdgeBps() с ростом объёма.
    function holdBps() external view returns (bool houseAhead, uint256 magnitudeBps) {
        if (totalWagered == 0) return (true, 0);
        if (totalPaidOut <= totalWagered) {
            return (true, (totalWagered - totalPaidOut) * BPS / totalWagered);
        }
        return (false, (totalPaidOut - totalWagered) * BPS / totalWagered);
    }

    /// @notice Адрес контракта Pyth Entropy (для отображения и проверки on-chain).
    function entropyAddress() external view returns (address) {
        return address(_entropy);
    }

    // ============================================================
    // Админ (Ownable)
    // ============================================================

    /// @notice Пополнить банк казино (ликвидность под выплаты).
    function fundBank() external payable onlyOwner {
        if (msg.value == 0) revert ZeroAmount();
        casinoBank += msg.value;
        emit BankFunded(msg.value, casinoBank);
    }

    /// @notice Пополнить пул крана.
    function fundFaucet() external payable onlyOwner {
        if (msg.value == 0) revert ZeroAmount();
        faucetPool += msg.value;
        emit FaucetFunded(msg.value, faucetPool);
    }

    /// @notice Вывести прибыль казино — строго из свободного банка (не из locked/balances/faucet).
    function withdrawHouse(uint256 amount) external onlyOwner nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (amount > casinoBank) revert InsufficientBalance();

        casinoBank -= amount; // EFFECTS
        (bool ok,) = payable(owner()).call{ value: amount }(""); // INTERACTIONS
        if (!ok) revert TransferFailed();
        emit HouseWithdrawn(amount);
    }
}
