// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Test } from "forge-std/Test.sol";
import { LimboCasino } from "../src/LimboCasino.sol";
import { IEntropyConsumer } from "@pythnetwork/entropy-sdk-solidity/IEntropyConsumer.sol";

/// @dev Имитатор Pyth Entropy: отдаёт комиссию, выдаёт sequenceNumber и умеет дёрнуть колбэк
///      потребителя от своего имени (= адрес Entropy, поэтому проверка отправителя в колбэке проходит).
///      Реализует только методы, которые реально вызывает LimboCasino (getFeeV2/requestV2) — селекторы совпадают.
contract MockEntropy {
    uint128 public fee = 1e13; // ~0.00001 ETH, как на Base Sepolia
    uint64 public seqCounter;
    address public constant PROVIDER = address(0xBEEF);

    function setFee(uint128 f) external {
        fee = f;
    }

    function getFeeV2() external view returns (uint128) {
        return fee;
    }

    function getDefaultProvider() external pure returns (address) {
        return PROVIDER;
    }

    function requestV2() external payable returns (uint64) {
        seqCounter += 1;
        return seqCounter;
    }

    /// @dev Имитация второй транзакции Pyth: вызов колбэка потребителя.
    function fireCallback(address consumer, uint64 seq, bytes32 rnd) external {
        IEntropyConsumer(consumer)._entropyCallback(seq, PROVIDER, rnd);
    }
}

contract LimboCasinoTest is Test {
    LimboCasino internal casino;
    MockEntropy internal entropy;

    address internal owner = makeAddr("owner");
    address internal player = makeAddr("player");

    uint256 internal constant SCALE = 1e6;
    uint256 internal constant TWO_X = 2 * SCALE; // 2.00x
    uint256 internal fee;

    // случайные числа, дающие крайние множители
    bytes32 internal constant RND_MAX = bytes32(uint256(0)); // n=1 -> множитель упирается в cap (выигрыш)
    bytes32 internal constant RND_MIN = bytes32(uint256(16_777_215)); // n=2^24 -> множитель 1.00x (проигрыш при T>1)

    function setUp() public {
        entropy = new MockEntropy();
        casino = new LimboCasino(address(entropy), owner);
        fee = entropy.fee();

        vm.deal(owner, 100 ether);
        vm.startPrank(owner);
        casino.fundBank{ value: 50 ether }();
        casino.fundFaucet{ value: 1 ether }();
        vm.stopPrank();

        vm.deal(player, 10 ether);
    }

    // --- хелперы ---

    function _deposit(address who, uint256 amount) internal {
        vm.prank(who);
        casino.deposit{ value: amount }();
    }

    function _placeBet(address who, uint256 target, uint256 stake) internal returns (uint64 seq) {
        vm.prank(who);
        casino.placeBet{ value: fee }(target, stake);
        seq = entropy.seqCounter();
    }

    /// @dev Полный учёт средств обязан сходиться с фактическим балансом контракта.
    function _assertAccountingInvariant() internal view {
        uint256 tracked = casino.casinoBank() + casino.faucetPool() + casino.locked()
            + casino.balances(player) + casino.balances(owner);
        assertEq(address(casino).balance, tracked, "accounting != balance");
    }

    // ============================================================
    // Депозит / вывод
    // ============================================================

    function test_Deposit() public {
        _deposit(player, 1 ether);
        assertEq(casino.balances(player), 1 ether);
        _assertAccountingInvariant();
    }

    function test_Deposit_RevertsZero() public {
        vm.prank(player);
        vm.expectRevert(LimboCasino.ZeroAmount.selector);
        casino.deposit{ value: 0 }();
    }

    function test_Withdraw() public {
        _deposit(player, 1 ether);
        uint256 before = player.balance;
        vm.prank(player);
        casino.withdraw(0.4 ether);
        assertEq(casino.balances(player), 0.6 ether);
        assertEq(player.balance, before + 0.4 ether);
        _assertAccountingInvariant();
    }

    function test_Withdraw_RevertsTooMuch() public {
        _deposit(player, 1 ether);
        vm.prank(player);
        vm.expectRevert(LimboCasino.InsufficientBalance.selector);
        casino.withdraw(2 ether);
    }

    // ============================================================
    // Кран — один claim на адрес
    // ============================================================

    function test_FaucetClaimOnce() public {
        uint256 before = player.balance;
        vm.prank(player);
        casino.claimFaucet();
        assertEq(player.balance, before + casino.FAUCET_AMOUNT());
        assertTrue(casino.faucetClaimed(player));
        _assertAccountingInvariant();
    }

    function test_FaucetClaim_RevertsSecondTime() public {
        vm.startPrank(player);
        casino.claimFaucet();
        vm.expectRevert(LimboCasino.FaucetAlreadyClaimed.selector);
        casino.claimFaucet();
        vm.stopPrank();
    }

    // ============================================================
    // Ставка: резерв + запрос
    // ============================================================

    function test_PlaceBet_ReservesAndRequests() public {
        _deposit(player, 1 ether);
        uint256 stake = 0.1 ether;
        uint256 potential = stake * TWO_X / SCALE; // 0.2 ether

        uint64 seq = _placeBet(player, TWO_X, stake);

        assertEq(seq, 1);
        assertEq(casino.balances(player), 1 ether - stake);
        assertEq(casino.locked(), potential);
        assertEq(casino.casinoBank(), 50 ether + stake - potential);
        assertEq(casino.totalWagered(), stake);

        (address p, uint256 s, uint256 t, uint256 pp, bool settled) = casino.bets(seq);
        assertEq(p, player);
        assertEq(s, stake);
        assertEq(t, TWO_X);
        assertEq(pp, potential);
        assertFalse(settled);
        _assertAccountingInvariant();
    }

    function test_PlaceBet_SurplusCreditedToBalance() public {
        _deposit(player, 1 ether);
        uint256 stake = 0.1 ether;
        uint256 surplus = 0.05 ether;
        vm.prank(player);
        casino.placeBet{ value: fee + surplus }(TWO_X, stake);
        // 1 - stake + surplus
        assertEq(casino.balances(player), 1 ether - stake + surplus);
        _assertAccountingInvariant();
    }

    function test_PlaceBet_RevertsInvalidTarget() public {
        _deposit(player, 1 ether);
        uint256 maxMul = casino.MAX_MULTIPLIER(); // вынести внешний вызов из-под expectRevert
        vm.startPrank(player);
        vm.expectRevert(LimboCasino.InvalidTarget.selector);
        casino.placeBet{ value: fee }(SCALE, 0.1 ether); // 1.00x < MIN_MULTIPLIER
        vm.expectRevert(LimboCasino.InvalidTarget.selector);
        casino.placeBet{ value: fee }(maxMul + 1, 0.1 ether);
        vm.stopPrank();
    }

    function test_PlaceBet_RevertsTooSmall() public {
        _deposit(player, 1 ether);
        uint256 minBet = casino.MIN_BET(); // вынести внешний вызов из-под expectRevert
        vm.prank(player);
        vm.expectRevert(LimboCasino.BetTooSmall.selector);
        casino.placeBet{ value: fee }(TWO_X, minBet - 1);
    }

    function test_PlaceBet_RevertsInsufficientBalance() public {
        _deposit(player, 0.05 ether);
        vm.prank(player);
        vm.expectRevert(LimboCasino.InsufficientBalance.selector);
        casino.placeBet{ value: fee }(TWO_X, 0.1 ether);
    }

    function test_PlaceBet_RevertsInsufficientFee() public {
        _deposit(player, 1 ether);
        vm.prank(player);
        vm.expectRevert(LimboCasino.InsufficientEntropyFee.selector);
        casino.placeBet{ value: fee - 1 }(TWO_X, 0.1 ether);
    }

    function test_PlaceBet_RevertsBankCannotCover() public {
        // ставка, чья выплата превышает банк: stake * 10000x >> 50 ether
        _deposit(player, 9 ether);
        uint256 maxMul = casino.MAX_MULTIPLIER(); // вынести внешний вызов из-под expectRevert
        vm.prank(player);
        vm.expectRevert(LimboCasino.BankCannotCover.selector);
        casino.placeBet{ value: fee }(maxMul, 1 ether); // potential = 10000 ether
    }

    // ============================================================
    // Колбэк: выигрыш / проигрыш
    // ============================================================

    function test_Callback_Win() public {
        _deposit(player, 1 ether);
        uint256 stake = 0.1 ether;
        uint256 potential = stake * TWO_X / SCALE;
        uint64 seq = _placeBet(player, TWO_X, stake);

        entropy.fireCallback(address(casino), seq, RND_MAX); // множитель упирается в cap -> выигрыш

        assertEq(casino.balances(player), 1 ether - stake + potential);
        assertEq(casino.locked(), 0);
        assertEq(casino.totalPaidOut(), potential);
        assertEq(casino.betsWon(), 1);
        assertEq(casino.betsTotal(), 1);

        (,,,, bool settled) = casino.bets(seq);
        assertTrue(settled);
        _assertAccountingInvariant();
    }

    function test_Callback_Lose() public {
        _deposit(player, 1 ether);
        uint256 stake = 0.1 ether;
        uint256 bankBefore = casino.casinoBank();
        uint64 seq = _placeBet(player, TWO_X, stake);

        entropy.fireCallback(address(casino), seq, RND_MIN); // множитель 1.00x < 2.00x -> проигрыш

        assertEq(casino.balances(player), 1 ether - stake); // ставка потеряна
        assertEq(casino.locked(), 0);
        assertEq(casino.casinoBank(), bankBefore + stake); // банк забрал ставку
        assertEq(casino.betsWon(), 0);
        assertEq(casino.betsTotal(), 1);
        _assertAccountingInvariant();
    }

    function test_Callback_RevertsUnknownOrDouble() public {
        _deposit(player, 1 ether);
        uint64 seq = _placeBet(player, TWO_X, 0.1 ether);
        entropy.fireCallback(address(casino), seq, RND_MAX);
        // повторный колбэк по той же ставке
        vm.expectRevert(LimboCasino.UnknownOrSettledBet.selector);
        entropy.fireCallback(address(casino), seq, RND_MAX);
        // неизвестный seq
        vm.expectRevert(LimboCasino.UnknownOrSettledBet.selector);
        entropy.fireCallback(address(casino), 999, RND_MAX);
    }

    function test_Callback_OnlyEntropyCanCall() public {
        _deposit(player, 1 ether);
        uint64 seq = _placeBet(player, TWO_X, 0.1 ether);
        // прямой вызов _entropyCallback не от адреса Entropy должен реветить
        vm.prank(player);
        vm.expectRevert();
        IEntropyConsumer(address(casino))._entropyCallback(seq, address(0xBEEF), RND_MAX);
    }

    // ============================================================
    // Математика множителя
    // ============================================================

    function test_Multiplier_Bounds() public view {
        // n=1 (rnd=0): сырой множитель ~1.6e13 -> упирается в cap
        assertEq(casino.previewMultiplier(RND_MAX), casino.MAX_MULTIPLIER());
        // n=2^24 (rnd=2^24-1): множитель 0.99x -> поднимается до минимума 1.00x
        assertEq(casino.previewMultiplier(RND_MIN), SCALE);
    }

    function test_Multiplier_MidRange() public view {
        // подобрано n так, чтобы множитель был около 2x: n ~ 2^24*0.99/2
        uint256 n = 8_304_768; // (2^24 * 0.99) / 2 ≈ 8.3M
        bytes32 rnd = bytes32(n - 1); // _multiplierFrom прибавит +1 -> n
        uint256 m = casino.previewMultiplier(rnd);
        assertApproxEqRel(m, TWO_X, 0.01e18); // в пределах 1%
    }

    function test_Multiplier_Monotonic() public view {
        // больший n -> меньший множитель
        uint256 mLow = casino.previewMultiplier(bytes32(uint256(100)));
        uint256 mHigh = casino.previewMultiplier(bytes32(uint256(1_000_000)));
        assertGt(mLow, mHigh);
    }

    function testFuzz_Multiplier_AlwaysInRange(bytes32 rnd) public view {
        // при любом случайном числе множитель в [1.00x; MAX] — нет деления на ноль, нет выхода за cap
        uint256 m = casino.previewMultiplier(rnd);
        assertGe(m, SCALE);
        assertLe(m, casino.MAX_MULTIPLIER());
    }

    // ============================================================
    // Полная петля и учёт
    // ============================================================

    function test_FullLoop_FaucetDepositBetWithdraw() public {
        // кран -> депозит -> ставка -> выигрыш -> вывод
        vm.prank(player);
        casino.claimFaucet();

        _deposit(player, 1 ether);
        uint64 seq = _placeBet(player, TWO_X, 0.1 ether);
        entropy.fireCallback(address(casino), seq, RND_MAX);

        uint256 bal = casino.balances(player);
        assertEq(bal, 1 ether - 0.1 ether + 0.2 ether); // 1.1 ether

        vm.prank(player);
        casino.withdraw(bal);
        assertEq(casino.balances(player), 0);
        _assertAccountingInvariant();
    }

    function test_AccountingInvariant_AfterMixedActivity() public {
        _deposit(player, 2 ether);
        uint64 s1 = _placeBet(player, TWO_X, 0.3 ether);
        entropy.fireCallback(address(casino), s1, RND_MAX); // win
        uint64 s2 = _placeBet(player, 5 * SCALE, 0.2 ether);
        entropy.fireCallback(address(casino), s2, RND_MIN); // lose
        vm.prank(player);
        casino.withdraw(0.5 ether);
        _assertAccountingInvariant();
    }

    // ============================================================
    // Админ
    // ============================================================

    function test_WithdrawHouse_OnlyOwnerFromBank() public {
        uint256 ownerBefore = owner.balance;
        vm.prank(owner);
        casino.withdrawHouse(10 ether);
        assertEq(casino.casinoBank(), 40 ether);
        assertEq(owner.balance, ownerBefore + 10 ether);
        _assertAccountingInvariant();
    }

    function test_WithdrawHouse_RevertsNotOwner() public {
        vm.prank(player);
        vm.expectRevert();
        casino.withdrawHouse(1 ether);
    }

    function test_WithdrawHouse_CannotTouchLocked() public {
        // зарезервированные под ставку средства нельзя вывести как прибыль
        _deposit(player, 1 ether);
        _placeBet(player, TWO_X, 0.1 ether); // locked = 0.2 ether
        uint256 bank = casino.casinoBank();
        vm.prank(owner);
        vm.expectRevert(LimboCasino.InsufficientBalance.selector);
        casino.withdrawHouse(bank + 1); // больше свободного банка
    }

    // ============================================================
    // Reentrancy
    // ============================================================

    function test_Reentrancy_WithdrawGuarded() public {
        ReentrantAttacker attacker = new ReentrantAttacker(casino);
        vm.deal(address(attacker), 1 ether);
        attacker.seed(); // депонирует свои 1 ether
        attacker.attack(); // withdraw(0.5) + попытка повторного входа из receive()
        // guard сработал: прошёл ровно ОДИН вывод (иначе баланс был бы 0, а у атакующего >0.5)
        assertEq(casino.balances(address(attacker)), 0.5 ether);
        assertEq(address(attacker).balance, 0.5 ether);
    }
}

/// @dev Контракт-атакующий: пытается повторно войти в withdraw из receive().
contract ReentrantAttacker {
    LimboCasino internal casino;
    bool internal reentered;

    constructor(LimboCasino c) {
        casino = c;
    }

    function seed() external {
        casino.deposit{ value: address(this).balance }(); // депонирует собственный баланс
    }

    function attack() external {
        casino.withdraw(0.5 ether);
    }

    receive() external payable {
        if (!reentered) {
            reentered = true;
            try casino.withdraw(0.5 ether) { } catch { }
        }
    }
}
