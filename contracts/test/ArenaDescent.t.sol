// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ArenaDescent} from "../ArenaDescent.sol";

/// @dev Minimal 6-decimal USDC stand-in.
contract MockUSDC is ERC20 {
    constructor(string memory n) ERC20(n, n) {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract ArenaDescentTest is Test {
    ArenaDescent internal arena;
    MockUSDC internal usdc;

    address internal owner = makeAddr("owner");
    address internal stranger = makeAddr("stranger");
    address internal operator;
    uint256 internal opKey;
    address internal impostor;
    uint256 internal impKey;
    address[5] internal pl;

    uint128 internal constant FEE = 5_000_000;
    uint256 internal constant SEED = 1_000_000_000; // 1000 USDC pool
    bytes32 internal constant RUN1 = keccak256("run1");
    bytes32 internal constant RUN2 = keccak256("run2");
    bytes32 internal constant RUN3 = keccak256("run3");
    bytes32 internal constant RUN4 = keccak256("run4");
    uint256 internal constant START = 19_700 days + 1 hours;

    function setUp() public {
        vm.warp(START);
        (operator, opKey) = makeAddrAndKey("operator");
        (impostor, impKey) = makeAddrAndKey("impostor");
        usdc = new MockUSDC("USDC");
        arena = new ArenaDescent(address(usdc), owner, operator, FEE);
        for (uint256 i; i < 5; ++i) {
            pl[i] = makeAddr(string.concat("player", vm.toString(i)));
            _giveUsdc(pl[i], 1_000e6);
        }
        _giveUsdc(stranger, 1_000e6);
        _giveUsdc(owner, 10_000e6);
        vm.prank(owner);
        arena.fund(SEED);
    }

    // ───────────────────────── helpers ─────────────────────────

    function _giveUsdc(address who, uint256 amt) internal {
        usdc.mint(who, amt);
        vm.prank(who);
        usdc.approve(address(arena), type(uint256).max);
    }

    function _domainSeparator() internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes("ArenaDescent")),
                keccak256(bytes("1")),
                block.chainid,
                address(arena)
            )
        );
    }

    function _sig(uint256 pk, bytes32 id, address player, uint64 expiry, uint128 fee)
        internal
        view
        returns (bytes memory)
    {
        bytes32 structHash = keccak256(abi.encode(arena.TICKET_TYPEHASH(), id, player, expiry, fee));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _domainSeparator(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }

    function _exp() internal view returns (uint64) {
        return uint64(block.timestamp + 1 hours);
    }

    function _state(bytes32 id) internal view returns (ArenaDescent.RunState st) {
        (st,,,,,) = arena.runInfo(id);
    }

    function _entries(bytes32 id) internal view returns (uint8 n) {
        (,, n,,,) = arena.runInfo(id);
    }

    function _enterFee(bytes32 id, address who, uint128 fee) internal {
        uint64 e = _exp();
        bytes memory s = _sig(opKey, id, who, e, fee);
        vm.prank(who);
        arena.enter(id, e, fee, s);
    }

    function _enter(bytes32 id, address who) internal {
        _enterFee(id, who, FEE);
    }

    function _fill(bytes32 id) internal {
        for (uint256 i; i < 5; ++i) {
            _enter(id, pl[i]);
        }
    }

    function _settle(bytes32 id, uint16 floors, address[] memory leavers) internal {
        vm.prank(operator);
        arena.settle(id, floors, leavers);
    }

    function _none() internal pure returns (address[] memory a) {
        a = new address[](0);
    }

    function _arr(address a) internal pure returns (address[] memory r) {
        r = new address[](1);
        r[0] = a;
    }

    function _arr(address a, address b) internal pure returns (address[] memory r) {
        r = new address[](2);
        r[0] = a;
        r[1] = b;
    }

    function _raiseCap() internal {
        vm.prank(owner);
        arena.setMaxPayoutPerRun(1_000e6);
    }

    function _pause() internal {
        vm.prank(owner);
        arena.pause();
    }

    function _expPayout(uint256 p, uint16 f) internal view returns (uint256 x) {
        if (f < 3) return 0;
        uint256 rate = uint256(f) * 100;
        if (rate > 2500) rate = 2500;
        x = (p * rate) / 10_000;
        if (x > arena.maxPayoutPerRun()) x = arena.maxPayoutPerRun();
    }

    function _assertSolvent() internal view {
        assertGe(usdc.balanceOf(address(arena)), arena.pool() + arena.totalCredits() + arena.totalEscrow());
    }

    // ───────────────────────── deployment ─────────────────────────

    function test_Deploy_State() public view {
        assertEq(address(arena.usdc()), address(usdc));
        assertEq(arena.owner(), owner);
        assertEq(arena.operator(), operator);
        assertEq(arena.entryFee(), FEE);
        assertEq(arena.pool(), SEED);
        assertEq(arena.poolBalance(), SEED);
        assertEq(arena.dayIndex(), START / 1 days);
        (, string memory n, string memory v, uint256 cid, address vc,,) = arena.eip712Domain();
        assertEq(n, "ArenaDescent");
        assertEq(v, "1");
        assertEq(cid, block.chainid);
        assertEq(vc, address(arena));
    }

    function test_Deploy_RevertsOnZeroAddressesAndBadFee() public {
        vm.expectRevert(ArenaDescent.ZeroAddress.selector);
        new ArenaDescent(address(0), owner, operator, FEE);
        // Ownable's constructor rejects a zero owner before the contract's own check runs.
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableInvalidOwner.selector, address(0)));
        new ArenaDescent(address(usdc), address(0), operator, FEE);
        vm.expectRevert(ArenaDescent.ZeroAddress.selector);
        new ArenaDescent(address(usdc), owner, address(0), FEE);
        vm.expectRevert(abi.encodeWithSelector(ArenaDescent.InvalidEntryFee.selector, uint128(1)));
        new ArenaDescent(address(usdc), owner, operator, 1);
    }

    // ───────────────────────── (1) enter ─────────────────────────

    function test_Enter_ValidTicket() public {
        uint64 e = _exp();
        bytes memory s = _sig(opKey, RUN1, pl[0], e, FEE);
        vm.expectEmit(true, true, false, true, address(arena));
        emit ArenaDescent.Entered(RUN1, pl[0], 1);
        vm.prank(pl[0]);
        arena.enter(RUN1, e, FEE, s);

        (ArenaDescent.RunState st, uint128 fee, uint8 n, uint256 first,, address[5] memory players) =
            arena.runInfo(RUN1);
        assertEq(uint8(st), uint8(ArenaDescent.RunState.Open));
        assertEq(fee, FEE);
        assertEq(n, 1);
        assertEq(first, block.timestamp);
        assertEq(players[0], pl[0]);
        assertTrue(arena.entered(RUN1, pl[0]));
        assertEq(arena.totalEscrow(), FEE);
        assertEq(arena.pool(), SEED);
        assertEq(usdc.balanceOf(pl[0]), 1_000e6 - FEE);
        assertEq(usdc.balanceOf(address(arena)), SEED + FEE);
    }

    function test_Enter_TicketValidAtExactExpiry() public {
        uint64 e = uint64(block.timestamp);
        bytes memory s = _sig(opKey, RUN1, pl[0], e, FEE);
        vm.prank(pl[0]);
        arena.enter(RUN1, e, FEE, s);
        assertEq(_entries(RUN1), 1);
    }

    function test_Enter_FiveEntriesFillRun() public {
        for (uint256 i; i < 4; ++i) {
            _enter(RUN1, pl[i]);
            assertEq(uint8(_state(RUN1)), uint8(ArenaDescent.RunState.Open));
        }
        _enter(RUN1, pl[4]);
        (ArenaDescent.RunState st,, uint8 n,, uint256 filled, address[5] memory players) = arena.runInfo(RUN1);
        assertEq(uint8(st), uint8(ArenaDescent.RunState.Full));
        assertEq(n, 5);
        assertEq(filled, block.timestamp);
        for (uint256 i; i < 5; ++i) {
            assertEq(players[i], pl[i]);
        }
        assertEq(arena.totalEscrow(), 5 * uint256(FEE));
        assertEq(arena.pool(), SEED);
        assertEq(usdc.balanceOf(address(arena)), SEED + 5 * uint256(FEE));
    }

    function test_Enter_RevertsWrongSigner() public {
        uint64 e = _exp();
        bytes memory s = _sig(impKey, RUN1, pl[0], e, FEE);
        vm.expectRevert(ArenaDescent.InvalidTicket.selector);
        vm.prank(pl[0]);
        arena.enter(RUN1, e, FEE, s);
    }

    function test_Enter_RevertsTicketForAnotherPlayer() public {
        uint64 e = _exp();
        bytes memory s = _sig(opKey, RUN1, pl[1], e, FEE);
        vm.expectRevert(ArenaDescent.InvalidTicket.selector);
        vm.prank(pl[0]);
        arena.enter(RUN1, e, FEE, s);
    }

    function test_Enter_RevertsTicketForAnotherRun() public {
        uint64 e = _exp();
        bytes memory s = _sig(opKey, RUN2, pl[0], e, FEE);
        vm.expectRevert(ArenaDescent.InvalidTicket.selector);
        vm.prank(pl[0]);
        arena.enter(RUN1, e, FEE, s);
    }

    function test_Enter_RevertsTicketSignedByReplacedOperator() public {
        uint64 e = _exp();
        bytes memory s = _sig(opKey, RUN1, pl[0], e, FEE);
        vm.prank(owner);
        arena.setOperator(impostor);
        vm.expectRevert(ArenaDescent.InvalidTicket.selector);
        vm.prank(pl[0]);
        arena.enter(RUN1, e, FEE, s);
    }

    function test_Enter_RevertsExpiredTicket() public {
        uint64 e = _exp();
        bytes memory s = _sig(opKey, RUN1, pl[0], e, FEE);
        vm.warp(uint256(e) + 1);
        vm.expectRevert(abi.encodeWithSelector(ArenaDescent.TicketExpired.selector, e));
        vm.prank(pl[0]);
        arena.enter(RUN1, e, FEE, s);
    }

    function test_Enter_RevertsFeeMismatchNewRun() public {
        uint64 e = _exp();
        bytes memory s = _sig(opKey, RUN1, pl[0], e, 4_000_000);
        vm.expectRevert(abi.encodeWithSelector(ArenaDescent.FeeMismatch.selector, FEE, uint128(4_000_000)));
        vm.prank(pl[0]);
        arena.enter(RUN1, e, 4_000_000, s);
    }

    function test_Enter_RevertsTicketFeeAltered() public {
        // Ticket signed for FEE but caller passes a different (current-fee-matching) fee -> bad signer.
        uint64 e = _exp();
        bytes memory s = _sig(opKey, RUN1, pl[0], e, FEE + 1);
        vm.expectRevert(ArenaDescent.InvalidTicket.selector);
        vm.prank(pl[0]);
        arena.enter(RUN1, e, FEE, s);
    }

    function test_Enter_FeeChangeDoesNotAffectOpenRun() public {
        _enter(RUN1, pl[0]);
        vm.prank(owner);
        arena.setEntryFee(10_000_000);

        uint64 e = _exp();
        bytes memory s = _sig(opKey, RUN1, pl[1], e, 10_000_000);
        vm.expectRevert(abi.encodeWithSelector(ArenaDescent.FeeMismatch.selector, FEE, uint128(10_000_000)));
        vm.prank(pl[1]);
        arena.enter(RUN1, e, 10_000_000, s);

        _enter(RUN1, pl[1]); // old fee still works on the existing run
        assertEq(arena.totalEscrow(), 2 * uint256(FEE));

        // A brand new run uses the new fee.
        _enterFee(RUN2, pl[2], 10_000_000);
        (, uint128 fee,,,,) = arena.runInfo(RUN2);
        assertEq(fee, 10_000_000);
    }

    function test_Enter_RevertsSixthEntry() public {
        _fill(RUN1);
        uint64 e = _exp();
        bytes memory s = _sig(opKey, RUN1, stranger, e, FEE);
        vm.expectRevert(
            abi.encodeWithSelector(ArenaDescent.InvalidRunState.selector, RUN1, ArenaDescent.RunState.Full)
        );
        vm.prank(stranger);
        arena.enter(RUN1, e, FEE, s);
    }

    function test_Enter_RevertsTwice() public {
        _enter(RUN1, pl[0]);
        uint64 e = _exp();
        bytes memory s = _sig(opKey, RUN1, pl[0], e, FEE);
        vm.expectRevert(ArenaDescent.AlreadyEntered.selector);
        vm.prank(pl[0]);
        arena.enter(RUN1, e, FEE, s);
    }

    function test_Enter_RevertsWhenPaused() public {
        uint64 e = _exp();
        bytes memory s = _sig(opKey, RUN1, pl[0], e, FEE);
        _pause();
        vm.expectRevert(Pausable.EnforcedPause.selector);
        vm.prank(pl[0]);
        arena.enter(RUN1, e, FEE, s);
    }

    function test_Enter_RevertsOnSettledAndCancelledRun() public {
        _fill(RUN1);
        _settle(RUN1, 3, _none());
        uint64 e = _exp();
        bytes memory s = _sig(opKey, RUN1, stranger, e, FEE);
        vm.expectRevert(
            abi.encodeWithSelector(ArenaDescent.InvalidRunState.selector, RUN1, ArenaDescent.RunState.Settled)
        );
        vm.prank(stranger);
        arena.enter(RUN1, e, FEE, s);

        _enter(RUN2, pl[0]);
        vm.prank(operator);
        arena.cancelRun(RUN2);
        s = _sig(opKey, RUN2, pl[1], e, FEE);
        vm.expectRevert(
            abi.encodeWithSelector(ArenaDescent.InvalidRunState.selector, RUN2, ArenaDescent.RunState.Cancelled)
        );
        vm.prank(pl[1]);
        arena.enter(RUN2, e, FEE, s);
    }

    // ───────────────────────── (2) settle ─────────────────────────

    function test_Settle_RevertsNonOperator() public {
        _fill(RUN1);
        address[] memory none = _none();
        vm.expectRevert(ArenaDescent.OnlyOperator.selector);
        vm.prank(stranger);
        arena.settle(RUN1, 10, none);
        vm.expectRevert(ArenaDescent.OnlyOperator.selector);
        vm.prank(owner);
        arena.settle(RUN1, 10, none);
    }

    function test_Settle_RevertsIfRunNotFull() public {
        address[] memory none = _none();
        vm.expectRevert(
            abi.encodeWithSelector(ArenaDescent.InvalidRunState.selector, RUN1, ArenaDescent.RunState.None)
        );
        vm.prank(operator);
        arena.settle(RUN1, 10, none);

        _enter(RUN1, pl[0]);
        vm.expectRevert(
            abi.encodeWithSelector(ArenaDescent.InvalidRunState.selector, RUN1, ArenaDescent.RunState.Open)
        );
        vm.prank(operator);
        arena.settle(RUN1, 10, none);
    }

    function _curve(uint16 floors, uint256 expTotal, uint256 expEach) internal {
        _raiseCap();
        _fill(RUN1);
        uint256 poolAfterEscrow = SEED + 5 * uint256(FEE);
        vm.expectEmit(true, false, false, true, address(arena));
        emit ArenaDescent.Settled(RUN1, floors, expTotal, 5);
        _settle(RUN1, floors, _none());
        assertEq(uint8(_state(RUN1)), uint8(ArenaDescent.RunState.Settled));
        assertEq(arena.totalEscrow(), 0);
        assertEq(arena.pool(), poolAfterEscrow - expTotal);
        assertEq(arena.totalCredits(), expTotal);
        for (uint256 i; i < 5; ++i) {
            assertEq(arena.credits(pl[i]), expEach);
        }
        _assertSolvent();
    }

    function test_Settle_Floors3() public {
        _curve(3, 30_750_000, 6_150_000);
    }

    function test_Settle_Floors10() public {
        _curve(10, 102_500_000, 20_500_000);
    }

    function test_Settle_Floors25() public {
        _curve(25, 256_250_000, 51_250_000);
    }

    function test_Settle_Floors60CapsAt25Percent() public {
        _curve(60, 256_250_000, 51_250_000);
    }

    function _belowMin(uint16 floors) internal {
        _fill(RUN1);
        _settle(RUN1, floors, _none());
        assertEq(uint8(_state(RUN1)), uint8(ArenaDescent.RunState.Settled));
        assertEq(arena.pool(), SEED + 5 * uint256(FEE));
        assertEq(arena.totalEscrow(), 0);
        assertEq(arena.totalCredits(), 0);
        assertEq(arena.paidToday(), 0);
        assertEq(arena.dayPoolSnapshot(), 0);
        for (uint256 i; i < 5; ++i) {
            assertEq(arena.credits(pl[i]), 0);
        }
    }

    function test_Settle_Floors0PaysNothing() public {
        _belowMin(0);
    }

    function test_Settle_Floors1PaysNothing() public {
        _belowMin(1);
    }

    function test_Settle_Floors2PaysNothing() public {
        _belowMin(2);
    }

    function test_Settle_CappedByMaxPayoutPerRun() public {
        _fill(RUN1);
        _settle(RUN1, 60, _none()); // 25% of 1025 = 256.25 > default 200 cap
        assertEq(arena.totalCredits(), 200_000_000);
        assertEq(arena.credits(pl[0]), 40_000_000);
        assertEq(arena.pool(), 825_000_000);
    }

    function test_Settle_CapChangeAppliesToExistingRun() public {
        _fill(RUN1);
        vm.prank(owner);
        arena.setMaxPayoutPerRun(50_000_000);
        _settle(RUN1, 25, _none());
        assertEq(arena.totalCredits(), 50_000_000);
    }

    function test_Settle_ZeroMaxPayoutDisablesPrizes() public {
        vm.prank(owner);
        arena.setMaxPayoutPerRun(0);
        _fill(RUN1);
        _settle(RUN1, 60, _none());
        assertEq(arena.totalCredits(), 0);
        assertEq(arena.pool(), SEED + 5 * uint256(FEE));
    }

    function test_Settle_RoundingDustStaysInPool() public {
        _giveUsdc(stranger, 0);
        vm.prank(stranger);
        arena.fund(34); // pool = 1000e6 + 34
        _fill(RUN1);
        uint256 p = SEED + 34 + 5 * uint256(FEE); // 1_025_000_034
        assertEq(_expPayout(p, 3), 30_750_001);
        _settle(RUN1, 3, _none());
        for (uint256 i; i < 5; ++i) {
            assertEq(arena.credits(pl[i]), 6_150_000);
        }
        assertEq(arena.totalCredits(), 30_750_000);
        assertEq(arena.paidToday(), 30_750_000);
        assertEq(arena.pool(), p - 30_750_000); // the 1 wei dust remains in the pool
        _assertSolvent();
    }

    function test_Settle_LeaversGetNothingStayersShare() public {
        _fill(RUN1);
        _settle(RUN1, 10, _arr(pl[0], pl[3])); // 102.5e6 / 3 stayers
        assertEq(arena.credits(pl[0]), 0);
        assertEq(arena.credits(pl[3]), 0);
        assertEq(arena.credits(pl[1]), 34_166_666);
        assertEq(arena.credits(pl[2]), 34_166_666);
        assertEq(arena.credits(pl[4]), 34_166_666);
        assertEq(arena.totalCredits(), 102_499_998);
        assertEq(arena.pool(), SEED + 25e6 - 102_499_998);
    }

    function test_Settle_SingleStayerGetsWholePayout() public {
        _fill(RUN1);
        address[] memory l = new address[](4);
        for (uint256 i; i < 4; ++i) {
            l[i] = pl[i];
        }
        _settle(RUN1, 10, l);
        assertEq(arena.credits(pl[4]), 102_500_000);
        assertEq(arena.totalCredits(), 102_500_000);
    }

    function test_Settle_AllFiveLeaversPaysNothing() public {
        _fill(RUN1);
        address[] memory l = new address[](5);
        for (uint256 i; i < 5; ++i) {
            l[i] = pl[i];
        }
        vm.expectEmit(true, false, false, true, address(arena));
        emit ArenaDescent.Settled(RUN1, 25, 0, 0);
        _settle(RUN1, 25, l);
        assertEq(uint8(_state(RUN1)), uint8(ArenaDescent.RunState.Settled));
        assertEq(arena.totalCredits(), 0);
        assertEq(arena.pool(), SEED + 25e6);
        assertEq(arena.totalEscrow(), 0);
    }

    function test_Settle_RevertsDuplicateLeaver() public {
        _fill(RUN1);
        address[] memory l = _arr(pl[1], pl[1]);
        vm.expectRevert(abi.encodeWithSelector(ArenaDescent.DuplicateLeaver.selector, pl[1]));
        vm.prank(operator);
        arena.settle(RUN1, 10, l);
    }

    function test_Settle_RevertsNonMemberLeaver() public {
        _fill(RUN1);
        address[] memory l = _arr(stranger);
        vm.expectRevert(abi.encodeWithSelector(ArenaDescent.InvalidLeaver.selector, stranger));
        vm.prank(operator);
        arena.settle(RUN1, 10, l);
    }

    function test_Settle_RevertsTooManyLeavers() public {
        _fill(RUN1);
        address[] memory l = new address[](6);
        for (uint256 i; i < 5; ++i) {
            l[i] = pl[i];
        }
        l[5] = pl[0];
        vm.expectRevert(ArenaDescent.TooManyLeavers.selector);
        vm.prank(operator);
        arena.settle(RUN1, 10, l);
    }

    function test_Settle_RevertsTwice() public {
        _fill(RUN1);
        _settle(RUN1, 10, _none());
        address[] memory none = _none();
        vm.expectRevert(
            abi.encodeWithSelector(ArenaDescent.InvalidRunState.selector, RUN1, ArenaDescent.RunState.Settled)
        );
        vm.prank(operator);
        arena.settle(RUN1, 10, none);
    }

    function testFuzz_Settle_Accounting(uint16 floors, uint8 leaverMask) public {
        leaverMask = uint8(bound(leaverMask, 0, 31));
        _fill(RUN1);
        uint256 n;
        for (uint256 i; i < 5; ++i) {
            if (leaverMask & (1 << i) != 0) ++n;
        }
        address[] memory l = new address[](n);
        uint256 k;
        for (uint256 i; i < 5; ++i) {
            if (leaverMask & (1 << i) != 0) l[k++] = pl[i];
        }
        uint256 poolBefore = SEED + 5 * uint256(FEE);
        uint256 exp = _expPayout(poolBefore, floors);
        uint256 stayers = 5 - n;
        uint256 expTotal = stayers == 0 ? 0 : (exp / stayers) * stayers;
        uint256 allowance = (poolBefore * arena.dailyCapBps()) / 10_000;
        if (exp > allowance) {
            // daily-limited: payout becomes allowance; recompute
            exp = allowance;
            expTotal = stayers == 0 ? 0 : (exp / stayers) * stayers;
        }
        _settle(RUN1, floors, l);
        assertEq(arena.totalCredits(), expTotal);
        assertEq(arena.pool(), poolBefore - expTotal);
        for (uint256 i; i < 5; ++i) {
            bool leaver = leaverMask & (1 << i) != 0;
            assertEq(arena.credits(pl[i]), leaver || stayers == 0 ? 0 : exp / stayers);
        }
        _assertSolvent();
    }

    // ───────────────────────── (3) daily cap ─────────────────────────

    function test_DailyCap_ReachedThenNextDayOk() public {
        _fill(RUN1);
        _fill(RUN2);
        _fill(RUN3);
        _settle(RUN1, 25, _none()); // 200e6 (per-run cap); pool 1025 -> 825
        _settle(RUN2, 25, _none()); // 200e6; pool 850 -> 650
        assertEq(arena.paidToday(), 400_000_000);
        assertEq(arena.dayPoolSnapshot(), 1_025_000_000);
        assertEq(arena.pool(), 650_000_000);

        // Run 3: pool 675e6, payout 168.75e6, allowance 410e6, remaining 10e6.
        address[] memory none = _none();
        vm.expectRevert(abi.encodeWithSelector(ArenaDescent.DailyCapReached.selector, 10_000_000, 168_750_000));
        vm.prank(operator);
        arena.settle(RUN3, 25, none);
        // Revert leaves the run untouched.
        assertEq(uint8(_state(RUN3)), uint8(ArenaDescent.RunState.Full));
        assertEq(arena.totalEscrow(), 5 * uint256(FEE));
        assertEq(arena.pool(), 650_000_000);

        // Next UTC day: fresh allowance based on a fresh snapshot.
        vm.warp((block.timestamp / 1 days + 1) * 1 days + 1);
        _settle(RUN3, 25, none);
        assertEq(uint8(_state(RUN3)), uint8(ArenaDescent.RunState.Settled));
        assertEq(arena.dayIndex(), block.timestamp / 1 days);
        assertEq(arena.paidToday(), 168_750_000);
        assertEq(arena.dayPoolSnapshot(), 675_000_000);
        assertEq(arena.credits(pl[0]), 200_000_000 / 5 * 2 + 33_750_000);
        _assertSolvent();
    }

    function test_DailyCap_SmallBpsLimitsPayoutToAllowance() public {
        vm.prank(owner);
        arena.setDailyCapBps(100); // 1%
        _fill(RUN1);
        _fill(RUN2);
        _settle(RUN1, 25, _none()); // base 200e6 -> limited to 1% of 1025e6 = 10.25e6
        assertEq(arena.totalCredits(), 10_250_000);
        assertEq(arena.credits(pl[2]), 2_050_000);
        assertEq(arena.paidToday(), 10_250_000);

        address[] memory none = _none();
        vm.expectRevert(abi.encodeWithSelector(ArenaDescent.DailyCapReached.selector, 0, 10_250_000));
        vm.prank(operator);
        arena.settle(RUN2, 25, none);

        // A zero-prize settlement is still fine on a capped-out day.
        _settle(RUN2, 1, none);
        assertEq(uint8(_state(RUN2)), uint8(ArenaDescent.RunState.Settled));
    }

    function test_DailyCap_SmallBpsSecondRunNextDay() public {
        vm.prank(owner);
        arena.setDailyCapBps(100);
        _fill(RUN1);
        _fill(RUN2);
        _settle(RUN1, 25, _none());
        vm.warp(block.timestamp + 1 days);
        _settle(RUN2, 25, _none());
        assertEq(arena.dayPoolSnapshot(), 1_039_750_000);
        assertEq(arena.paidToday(), 10_397_500);
        assertEq(arena.credits(pl[0]), 2_050_000 + 2_079_500);
    }

    // ───────────────────────── (4) refund ─────────────────────────

    function _refund(bytes32 id, address who) internal {
        vm.prank(who);
        arena.refund(id);
    }

    function _expectRefundUnavailable(bytes32 id, address who) internal {
        vm.expectRevert(ArenaDescent.RefundUnavailable.selector);
        vm.prank(who);
        arena.refund(id);
    }

    function test_Refund_BlockedWhileOpenBeforeTimeout() public {
        _enter(RUN1, pl[0]);
        _expectRefundUnavailable(RUN1, pl[0]);
        vm.warp(block.timestamp + 15 minutes); // strict comparison: exactly 15 min still blocked
        _expectRefundUnavailable(RUN1, pl[0]);
    }

    function test_Refund_AllowedAfterOpenTimeout() public {
        _enter(RUN1, pl[0]);
        _enter(RUN1, pl[1]);
        vm.warp(block.timestamp + 15 minutes + 1);
        vm.expectEmit(true, false, false, false, address(arena));
        emit ArenaDescent.RunCancelled(RUN1);
        vm.expectEmit(true, true, false, true, address(arena));
        emit ArenaDescent.Refunded(RUN1, pl[0], FEE);
        _refund(RUN1, pl[0]);
        assertEq(usdc.balanceOf(pl[0]), 1_000e6);
        assertEq(arena.totalEscrow(), FEE);
        assertTrue(arena.refunded(RUN1, pl[0]));
        assertEq(uint8(_state(RUN1)), uint8(ArenaDescent.RunState.Cancelled));
        // The other member can refund too (run now cancelled).
        _refund(RUN1, pl[1]);
        assertEq(usdc.balanceOf(pl[1]), 1_000e6);
        assertEq(arena.totalEscrow(), 0);
        assertEq(arena.pool(), SEED);
    }

    function test_Refund_AllowedAfterCancelByOperator() public {
        _enter(RUN1, pl[0]);
        vm.expectEmit(true, false, false, false, address(arena));
        emit ArenaDescent.RunCancelled(RUN1);
        vm.prank(operator);
        arena.cancelRun(RUN1);
        _refund(RUN1, pl[0]);
        assertEq(usdc.balanceOf(pl[0]), 1_000e6);
        assertEq(arena.totalEscrow(), 0);
    }

    function test_Refund_AllowedAfterCancelByOwner() public {
        _fill(RUN1);
        vm.prank(owner);
        arena.cancelRun(RUN1);
        for (uint256 i; i < 5; ++i) {
            _refund(RUN1, pl[i]);
            assertEq(usdc.balanceOf(pl[i]), 1_000e6);
        }
        assertEq(arena.totalEscrow(), 0);
        assertEq(arena.pool(), SEED);
        assertEq(usdc.balanceOf(address(arena)), SEED);
    }

    function test_CancelRun_RevertsForStranger() public {
        _enter(RUN1, pl[0]);
        vm.expectRevert(ArenaDescent.OnlyOperatorOrOwner.selector);
        vm.prank(stranger);
        arena.cancelRun(RUN1);
        vm.expectRevert(ArenaDescent.OnlyOperatorOrOwner.selector);
        vm.prank(pl[0]);
        arena.cancelRun(RUN1);
    }

    function test_CancelRun_RevertsOnNoneAndSettled() public {
        vm.expectRevert(
            abi.encodeWithSelector(ArenaDescent.InvalidRunState.selector, RUN1, ArenaDescent.RunState.None)
        );
        vm.prank(operator);
        arena.cancelRun(RUN1);
        _fill(RUN2);
        _settle(RUN2, 5, _none());
        vm.expectRevert(
            abi.encodeWithSelector(ArenaDescent.InvalidRunState.selector, RUN2, ArenaDescent.RunState.Settled)
        );
        vm.prank(operator);
        arena.cancelRun(RUN2);
    }

    function test_Refund_BlockedForStranger() public {
        _enter(RUN1, pl[0]);
        vm.prank(operator);
        arena.cancelRun(RUN1);
        vm.expectRevert(ArenaDescent.NotEntered.selector);
        vm.prank(stranger);
        arena.refund(RUN1);
    }

    function test_Refund_NoDoubleRefund() public {
        _enter(RUN1, pl[0]);
        _enter(RUN1, pl[1]);
        vm.prank(operator);
        arena.cancelRun(RUN1);
        _refund(RUN1, pl[0]);
        vm.expectRevert(ArenaDescent.AlreadyRefunded.selector);
        vm.prank(pl[0]);
        arena.refund(RUN1);
        assertEq(arena.totalEscrow(), FEE); // pl1's fee still escrowed
    }

    function test_Refund_FullRunOnlyAfterSevenDays() public {
        _fill(RUN1);
        _expectRefundUnavailable(RUN1, pl[0]);
        vm.warp(block.timestamp + 7 days); // strict: exactly 7 days still blocked
        _expectRefundUnavailable(RUN1, pl[0]);
        vm.warp(block.timestamp + 1);
        _refund(RUN1, pl[0]);
        assertEq(uint8(_state(RUN1)), uint8(ArenaDescent.RunState.Cancelled));
        assertEq(usdc.balanceOf(pl[0]), 1_000e6);
    }

    function test_Refund_FullRunAllowedWhenPaused() public {
        _fill(RUN1);
        _pause();
        _refund(RUN1, pl[0]);
        assertEq(usdc.balanceOf(pl[0]), 1_000e6);
        assertEq(uint8(_state(RUN1)), uint8(ArenaDescent.RunState.Cancelled));
    }

    function test_Refund_OpenRunAllowedWhenPaused() public {
        _enter(RUN1, pl[0]);
        _pause();
        _refund(RUN1, pl[0]);
        assertEq(usdc.balanceOf(pl[0]), 1_000e6);
    }

    function test_Refund_BlockedAfterSettle() public {
        _fill(RUN1);
        _settle(RUN1, 10, _none());
        vm.warp(block.timestamp + 30 days);
        _expectRefundUnavailable(RUN1, pl[0]);
        _pause();
        _expectRefundUnavailable(RUN1, pl[0]);
    }

    function test_Refund_RefundedRunCannotBeSettled() public {
        _fill(RUN1);
        vm.prank(owner);
        arena.cancelRun(RUN1);
        _refund(RUN1, pl[0]);
        address[] memory none = _none();
        vm.expectRevert(
            abi.encodeWithSelector(ArenaDescent.InvalidRunState.selector, RUN1, ArenaDescent.RunState.Cancelled)
        );
        vm.prank(operator);
        arena.settle(RUN1, 10, none);
    }

    function test_Refund_FirstTimeoutRefundCancelsFullRunForSettle() public {
        _fill(RUN1);
        vm.warp(block.timestamp + 7 days + 1);
        _refund(RUN1, pl[4]);
        address[] memory none = _none();
        vm.expectRevert(
            abi.encodeWithSelector(ArenaDescent.InvalidRunState.selector, RUN1, ArenaDescent.RunState.Cancelled)
        );
        vm.prank(operator);
        arena.settle(RUN1, 10, none);
    }

    function test_Refund_UsesRunFeeNotCurrentFee() public {
        _enter(RUN1, pl[0]);
        vm.prank(owner);
        arena.setEntryFee(10_000_000);
        vm.prank(operator);
        arena.cancelRun(RUN1);
        _refund(RUN1, pl[0]);
        assertEq(usdc.balanceOf(pl[0]), 1_000e6);
    }

    function test_Refund_RevertsIfNeverEntered() public {
        vm.expectRevert(ArenaDescent.NotEntered.selector);
        vm.prank(pl[0]);
        arena.refund(RUN1);
    }

    // ───────────────────────── (5) claim / fund / pause ─────────────────────────

    function test_Claim_PaysCreditsOnce() public {
        _fill(RUN1);
        _settle(RUN1, 10, _none()); // 20.5e6 each
        uint256 before = usdc.balanceOf(pl[0]);
        vm.expectEmit(true, false, false, true, address(arena));
        emit ArenaDescent.Claimed(pl[0], 20_500_000);
        vm.prank(pl[0]);
        arena.claim();
        assertEq(usdc.balanceOf(pl[0]), before + 20_500_000);
        assertEq(arena.credits(pl[0]), 0);
        assertEq(arena.totalCredits(), 4 * 20_500_000);

        vm.expectRevert(ArenaDescent.NoCredits.selector);
        vm.prank(pl[0]);
        arena.claim();
        _assertSolvent();
    }

    function test_Claim_RevertsWithoutCredits() public {
        vm.expectRevert(ArenaDescent.NoCredits.selector);
        vm.prank(stranger);
        arena.claim();
    }

    function test_Claim_WorksWhilePaused() public {
        _fill(RUN1);
        _settle(RUN1, 10, _none());
        _pause();
        uint256 before = usdc.balanceOf(pl[1]);
        vm.prank(pl[1]);
        arena.claim();
        assertEq(usdc.balanceOf(pl[1]), before + 20_500_000);
    }

    function test_Fund_AddsToPool() public {
        vm.expectEmit(true, false, false, true, address(arena));
        emit ArenaDescent.Funded(stranger, 7e6);
        vm.prank(stranger);
        arena.fund(7e6);
        assertEq(arena.pool(), SEED + 7e6);
        assertEq(usdc.balanceOf(address(arena)), SEED + 7e6);
        assertEq(arena.previewPayout(10), ((SEED + 7e6 + 25e6) * 1000) / 10_000);
    }

    function test_Pause_BlocksEnterSettleFund() public {
        _fill(RUN1);
        uint64 e = _exp();
        bytes memory s = _sig(opKey, RUN2, pl[0], e, FEE);
        address[] memory none = _none();
        _pause();

        vm.expectRevert(Pausable.EnforcedPause.selector);
        vm.prank(pl[0]);
        arena.enter(RUN2, e, FEE, s);

        vm.expectRevert(Pausable.EnforcedPause.selector);
        vm.prank(operator);
        arena.settle(RUN1, 10, none);

        vm.expectRevert(Pausable.EnforcedPause.selector);
        vm.prank(stranger);
        arena.fund(1e6);

        vm.prank(owner);
        arena.unpause();
        _settle(RUN1, 10, none);
        assertEq(uint8(_state(RUN1)), uint8(ArenaDescent.RunState.Settled));
    }

    function test_Pause_OnlyOwner() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        vm.prank(stranger);
        arena.pause();
        _pause();
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, operator));
        vm.prank(operator);
        arena.unpause();
    }

    // ───────────────────────── (6) admin ─────────────────────────

    function test_SetEntryFee_Bounds() public {
        vm.startPrank(owner);
        vm.expectRevert(abi.encodeWithSelector(ArenaDescent.InvalidEntryFee.selector, uint128(499_999)));
        arena.setEntryFee(499_999);
        vm.expectRevert(abi.encodeWithSelector(ArenaDescent.InvalidEntryFee.selector, uint128(50_000_001)));
        arena.setEntryFee(50_000_001);
        arena.setEntryFee(500_000);
        assertEq(arena.entryFee(), 500_000);
        vm.expectEmit(false, false, false, true, address(arena));
        emit ArenaDescent.EntryFeeUpdated(500_000, 50_000_000);
        arena.setEntryFee(50_000_000);
        assertEq(arena.entryFee(), 50_000_000);
        vm.stopPrank();
    }

    function test_SetEntryFee_OnlyOwner() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, operator));
        vm.prank(operator);
        arena.setEntryFee(1_000_000);
    }

    function test_SetMaxPayoutPerRun_HardMax() public {
        vm.startPrank(owner);
        arena.setMaxPayoutPerRun(1_000_000_000);
        assertEq(arena.maxPayoutPerRun(), 1_000_000_000);
        vm.expectRevert(abi.encodeWithSelector(ArenaDescent.InvalidMaxPayout.selector, 1_000_000_001));
        arena.setMaxPayoutPerRun(1_000_000_001);
        arena.setMaxPayoutPerRun(0);
        assertEq(arena.maxPayoutPerRun(), 0);
        vm.stopPrank();
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        vm.prank(stranger);
        arena.setMaxPayoutPerRun(1);
    }

    function test_SetDailyCapBps_HardMax() public {
        vm.startPrank(owner);
        arena.setDailyCapBps(5000);
        assertEq(arena.dailyCapBps(), 5000);
        vm.expectRevert(abi.encodeWithSelector(ArenaDescent.InvalidDailyCap.selector, uint16(5001)));
        arena.setDailyCapBps(5001);
        vm.stopPrank();
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        vm.prank(stranger);
        arena.setDailyCapBps(1);
    }

    function test_DailyCapZeroPaysNothing() public {
        vm.prank(owner);
        arena.setDailyCapBps(0);
        _fill(RUN1);
        _settle(RUN1, 25, _none());
        assertEq(arena.totalCredits(), 0);
        assertEq(uint8(_state(RUN1)), uint8(ArenaDescent.RunState.Settled));
    }

    function test_SetOperator() public {
        vm.expectRevert(ArenaDescent.ZeroAddress.selector);
        vm.prank(owner);
        arena.setOperator(address(0));
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        vm.prank(stranger);
        arena.setOperator(stranger);

        _fill(RUN1);
        vm.expectEmit(true, true, false, false, address(arena));
        emit ArenaDescent.OperatorUpdated(operator, impostor);
        vm.prank(owner);
        arena.setOperator(impostor);
        assertEq(arena.operator(), impostor);

        address[] memory none = _none();
        vm.expectRevert(ArenaDescent.OnlyOperator.selector);
        vm.prank(operator);
        arena.settle(RUN1, 10, none);
        vm.prank(impostor);
        arena.settle(RUN1, 10, none);
    }

    function test_RenounceOwnershipReverts() public {
        vm.expectRevert(ArenaDescent.RenounceDisabled.selector);
        vm.prank(owner);
        arena.renounceOwnership();
        assertEq(arena.owner(), owner);
    }

    function test_TwoStepOwnershipTransfer() public {
        vm.prank(owner);
        arena.transferOwnership(stranger);
        assertEq(arena.owner(), owner);
        vm.prank(stranger);
        arena.acceptOwnership();
        assertEq(arena.owner(), stranger);
    }

    function test_RescueToken() public {
        MockUSDC other = new MockUSDC("OTHER");
        other.mint(address(arena), 100);

        vm.expectRevert(ArenaDescent.CannotRescueUSDC.selector);
        vm.prank(owner);
        arena.rescueToken(address(usdc), owner, 1);

        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        vm.prank(stranger);
        arena.rescueToken(address(other), stranger, 100);

        vm.expectRevert(ArenaDescent.ZeroAddress.selector);
        vm.prank(owner);
        arena.rescueToken(address(other), address(0), 100);

        vm.prank(owner);
        arena.rescueToken(address(other), stranger, 100);
        assertEq(other.balanceOf(stranger), 100);
        assertEq(other.balanceOf(address(arena)), 0);
    }

    // ───────────────────────── (7) solvency after mixed sequence ─────────────────────────

    function test_Solvency_MixedSequence() public {
        _fill(RUN1);
        _assertSolvent();
        _settle(RUN1, 10, _arr(pl[4])); // 4 stayers x 25.625e6
        assertEq(arena.credits(pl[0]), 25_625_000);
        _assertSolvent();

        _fill(RUN2);
        vm.prank(owner);
        arena.cancelRun(RUN2);
        _refund(RUN2, pl[0]);
        _refund(RUN2, pl[1]);
        _assertSolvent();

        _enter(RUN3, pl[0]);
        _enter(RUN3, pl[1]);
        _enter(RUN3, pl[2]);
        _assertSolvent();

        vm.prank(pl[0]);
        arena.claim();
        _assertSolvent();

        _fill(RUN4);
        _settle(RUN4, 2, _none());
        _assertSolvent();

        _pause();
        vm.prank(pl[1]);
        arena.claim();
        _refund(RUN3, pl[2]); // open run refundable while paused
        vm.prank(owner);
        arena.unpause();
        _assertSolvent();

        // Unsolicited transfer is surplus: not pool, credits, or escrow.
        vm.prank(stranger);
        usdc.transfer(address(arena), 7e6);
        vm.prank(stranger);
        arena.fund(50e6);
        _assertSolvent();
        assertEq(
            usdc.balanceOf(address(arena)),
            arena.pool() + arena.totalCredits() + arena.totalEscrow() + 7e6
        );
    }
}
