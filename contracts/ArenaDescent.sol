// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title Arena Endless Descent
/// @notice USDC entry escrow and bounded, pull-based prizes for five-player survival runs.
/// @dev The operator is trusted ONLY to sign entry tickets and report floors cleared
///      and who left. Gameplay is not verified onchain; all prizes are bounded by the
///      immutable curve, per-run cap, daily allowance, and accounted pool. Operator
///      cancellation only unlocks members' own refunds; it never redirects funds.
///      The owner cannot withdraw USDC, including pool, escrow, credits, or unsolicited
///      transfers. The supplied token must be genuine six-decimal USDC, without transfer
///      fees or rebasing. Under that assumption, at completed transaction boundaries:
///      usdc.balanceOf(address(this)) >= pool + totalCredits + totalEscrow.
///      Direct USDC transfers bypassing fund() are not counted in the pool.
contract ArenaDescent is Ownable2Step, Pausable, ReentrancyGuard, EIP712 {
    using SafeERC20 for IERC20;

    uint8 public constant RUN_SIZE = 5;
    uint16 public constant MIN_FLOORS = 3;
    uint16 public constant BPS_PER_FLOOR = 100;
    uint16 public constant MAX_BPS = 2500;
    uint256 public constant BPS_DENOMINATOR = 10_000;
    uint256 public constant OPEN_TIMEOUT = 15 minutes;
    uint256 public constant STUCK_TIMEOUT = 7 days;
    uint128 public constant MIN_ENTRY_FEE = 500_000;
    uint128 public constant MAX_ENTRY_FEE = 50_000_000;
    uint256 public constant HARD_MAX_PAYOUT_PER_RUN = 1_000_000_000;
    uint16 public constant HARD_MAX_DAILY_CAP_BPS = 5000;
    bytes32 public constant TICKET_TYPEHASH = keccak256("Ticket(bytes32 runId,address player,uint64 expiry,uint128 fee)");

    enum RunState { None, Open, Full, Settled, Cancelled }

    /// @notice Permanent run record; entries and players remain unchanged by refunds.
    struct Run {
        RunState state;
        uint128 fee;
        uint8 entries;
        uint256 firstEntryAt;
        uint256 filledAt;
        address[5] players;
    }

    /// @notice Payment token; amounts are in base units (1 USDC = 1_000_000).
    IERC20 public immutable usdc;
    /// @notice Current ticket signer and gameplay reporter, replaceable by the owner.
    address public operator;
    /// @notice Fee for runs whose first entry has not yet occurred.
    uint128 public entryFee;
    uint256 public maxPayoutPerRun = 200_000_000;
    uint16 public dailyCapBps = 4000;

    /// @notice Accounted prize pool, excluding escrow, credits, and direct transfers.
    uint256 public pool;
    uint256 public totalEscrow;
    uint256 public totalCredits;
    /// @notice Day associated with paidToday and dayPoolSnapshot (UTC Unix days).
    uint256 public dayIndex;
    /// @notice Actual credits allocated on dayIndex, not amounts subsequently claimed.
    uint256 public paidToday;
    /// @notice Pool immediately before the first positive credit allocation on dayIndex.
    /// @dev Includes that run's escrow. Later funding/settlements do not increase it.
    uint256 public dayPoolSnapshot;

    mapping(bytes32 => Run) private _runs;
    mapping(bytes32 => mapping(address => bool)) public entered;
    mapping(bytes32 => mapping(address => bool)) public refunded;
    mapping(address => uint256) public credits;
    bool private _daySnapshotSet;

    error RenounceDisabled();
    error FeeMismatch(uint128 expected, uint128 given);
    error DailyCapReached(uint256 remaining, uint256 needed);
    error ZeroAddress();
    error OnlyOperator();
    error OnlyOperatorOrOwner();
    error InvalidEntryFee(uint128 fee);
    error InvalidMaxPayout(uint256 amount);
    error InvalidDailyCap(uint16 capBps);
    error InvalidRunState(bytes32 runId, RunState state);
    error TicketExpired(uint64 expiry);
    error InvalidTicket();
    error AlreadyEntered();
    error RunFull();
    error InvalidLeaver(address player);
    error DuplicateLeaver(address player);
    error TooManyLeavers();
    error NotEntered();
    error AlreadyRefunded();
    error RefundUnavailable();
    error NoCredits();
    error CannotRescueUSDC();

    event Entered(bytes32 indexed runId, address indexed player, uint8 entries);
    event Settled(bytes32 indexed runId, uint16 floors, uint256 totalPaid, uint8 stayers);
    event Claimed(address indexed player, uint256 amount);
    event Refunded(bytes32 indexed runId, address indexed player, uint256 amount);
    event RunCancelled(bytes32 indexed runId);
    event Funded(address indexed funder, uint256 amount);
    event EntryFeeUpdated(uint128 previousFee, uint128 newFee);
    event MaxPayoutPerRunUpdated(uint256 previousMax, uint256 newMax);
    event DailyCapBpsUpdated(uint16 previousCapBps, uint16 newCapBps);
    event OperatorUpdated(address indexed previousOperator, address indexed newOperator);
    event TokenRescued(address indexed token, address indexed to, uint256 amount);

    /// @notice Creates the escrow with a fixed EIP-712 domain and default payout caps.
    /// @param usdc_ Genuine six-decimal USDC contract.
    /// @param owner_ Initial owner; ownership transfers require acceptance.
    /// @param operator_ Nonzero server wallet that signs tickets and reports results.
    /// @param entryFee_ Initial fee, normally 5_000_000, within the immutable fee bounds.
    constructor(address usdc_, address owner_, address operator_, uint128 entryFee_)
        Ownable(owner_)
        EIP712("ArenaDescent", "1")
    {
        if (usdc_ == address(0) || owner_ == address(0) || operator_ == address(0)) revert ZeroAddress();
        _validateEntryFee(entryFee_);
        usdc = IERC20(usdc_);
        operator = operator_;
        entryFee = entryFee_;
        dayIndex = block.timestamp / 1 days;
        emit OperatorUpdated(address(0), operator_);
        emit EntryFeeUpdated(0, entryFee_);
        emit MaxPayoutPerRunUpdated(0, maxPayoutPerRun);
        emit DailyCapBpsUpdated(0, dailyCapBps);
    }

    modifier onlyOperator() {
        if (msg.sender != operator) revert OnlyOperator();
        _;
    }

    /// @notice Enters a run with a current-operator EIP-712 ticket and escrows its fee.
    /// @dev Tickets bind run, caller, expiry, fee, chain and contract; membership prevents
    ///      reuse. The fee a player signs for is the fee charged.
    ///      Replacing the operator invalidates tickets from the previous signer.
    ///      All entry effects precede the external USDC transfer and revert if it fails.
    function enter(bytes32 runId, uint64 expiry, uint128 fee, bytes calldata signature)
        external
        nonReentrant
        whenNotPaused
    {
        if (block.timestamp > expiry) revert TicketExpired(expiry);
        Run storage run = _runs[runId];
        if (run.state != RunState.None && run.state != RunState.Open) {
            revert InvalidRunState(runId, run.state);
        }
        if (entered[runId][msg.sender]) revert AlreadyEntered();
        if (run.entries >= RUN_SIZE) revert RunFull();
        uint128 expectedFee = run.state == RunState.None ? entryFee : run.fee;
        if (fee != expectedFee) revert FeeMismatch(expectedFee, fee);
        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(TICKET_TYPEHASH, runId, msg.sender, expiry, fee)));
        if (ECDSA.recover(digest, signature) != operator) revert InvalidTicket();

        if (run.state == RunState.None) {
            run.state = RunState.Open;
            run.fee = entryFee;
            run.firstEntryAt = block.timestamp;
        }
        entered[runId][msg.sender] = true;
        run.players[run.entries] = msg.sender;
        run.entries += 1;
        if (run.entries == RUN_SIZE) {
            run.state = RunState.Full;
            run.filledAt = block.timestamp;
        }
        totalEscrow += fee;
        usdc.safeTransferFrom(msg.sender, address(this), fee);
        emit Entered(runId, msg.sender, run.entries);
    }

    /// @notice Reports a full run and allocates bounded credits equally to its stayers.
    /// @dev Leavers must be distinct members. All run escrow joins the pool before
    ///      payout calculation; no external transfer occurs during settlement.
    ///      If the capped payout exceeds the remaining daily allowance, settlement
    ///      reverts without changes; the operator retries after the day rolls over.
    function settle(bytes32 runId, uint16 floors, address[] calldata leavers)
        external
        onlyOperator
        nonReentrant
        whenNotPaused
    {
        Run storage run = _runs[runId];
        if (run.state != RunState.Full) revert InvalidRunState(runId, run.state);
        if (leavers.length > RUN_SIZE) revert TooManyLeavers();
        uint256 leaverMask;
        for (uint256 i; i < leavers.length; ++i) {
            address player = leavers[i];
            if (!entered[runId][player]) revert InvalidLeaver(player);
            for (uint256 j; j < RUN_SIZE; ++j) {
                if (run.players[j] == player) {
                    uint256 bit = uint256(1) << j;
                    if ((leaverMask & bit) != 0) revert DuplicateLeaver(player);
                    leaverMask |= bit;
                    break;
                }
            }
        }

        run.state = RunState.Settled;
        uint256 escrow = uint256(run.fee) * RUN_SIZE;
        totalEscrow -= escrow;
        pool += escrow;
        _rollDay();
        uint8 stayers = RUN_SIZE - uint8(leavers.length);
        uint256 totalPaid;
        if (stayers != 0) totalPaid = _allocatePayout(run, floors, leaverMask, stayers);
        emit Settled(runId, floors, totalPaid, stayers);
    }

    /// @notice Claims your entire credit balance, including while paused.
    function claim() external nonReentrant {
        uint256 amount = credits[msg.sender];
        if (amount == 0) revert NoCredits();
        credits[msg.sender] = 0;
        totalCredits -= amount;
        usdc.safeTransfer(msg.sender, amount);
        emit Claimed(msg.sender, amount);
    }

    /// @notice Returns only your own entry fee after cancellation, timeout, or pausing.
    /// @dev A Full run is only refundable by members when cancelled by the operator or
    ///      owner, when the contract is paused, or when 7 days passed with no result.
    ///      The first refund of an Open/Full run cancels it permanently. Timeout
    ///      comparisons are strict; claim and refund remain callable while paused.
    function refund(bytes32 runId) external nonReentrant {
        Run storage run = _runs[runId];
        if (!entered[runId][msg.sender]) revert NotEntered();
        if (refunded[runId][msg.sender]) revert AlreadyRefunded();
        RunState state = run.state;
        bool active = state == RunState.Open || state == RunState.Full;
        bool timedOut = (state == RunState.Open && block.timestamp > run.firstEntryAt + OPEN_TIMEOUT)
            || (state == RunState.Full && block.timestamp > run.filledAt + STUCK_TIMEOUT);
        if (state != RunState.Cancelled && !timedOut && !(paused() && active)) revert RefundUnavailable();

        if (active) {
            run.state = RunState.Cancelled;
            emit RunCancelled(runId);
        }
        refunded[runId][msg.sender] = true;
        uint256 fee = run.fee;
        totalEscrow -= fee;
        usdc.safeTransfer(msg.sender, fee);
        emit Refunded(runId, msg.sender, fee);
    }

    /// @notice Lets the operator or owner cancel an active run, unlocking member refunds.
    function cancelRun(bytes32 runId) external {
        if (msg.sender != operator && msg.sender != owner()) revert OnlyOperatorOrOwner();
        Run storage run = _runs[runId];
        if (run.state != RunState.Open && run.state != RunState.Full) revert InvalidRunState(runId, run.state);
        run.state = RunState.Cancelled;
        emit RunCancelled(runId);
    }

    /// @notice Adds USDC to the accounted prize pool; requires allowance.
    function fund(uint256 amount) external nonReentrant whenNotPaused {
        pool += amount;
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        emit Funded(msg.sender, amount);
    }

    /// @notice Changes the fee only for runs starting after this transaction.
    function setEntryFee(uint128 fee) external onlyOwner {
        _validateEntryFee(fee);
        uint128 previousFee = entryFee;
        entryFee = fee;
        emit EntryFeeUpdated(previousFee, fee);
    }

    /// @notice Changes the per-run cap, including for existing runs; zero disables prizes.
    function setMaxPayoutPerRun(uint256 amount) external onlyOwner {
        if (amount > HARD_MAX_PAYOUT_PER_RUN) revert InvalidMaxPayout(amount);
        uint256 previousMax = maxPayoutPerRun;
        maxPayoutPerRun = amount;
        emit MaxPayoutPerRunUpdated(previousMax, amount);
    }

    /// @notice Changes the daily cap without resetting today's snapshot or spending.
    /// @dev If the new allowance is below paidToday, positive-payout settlements revert
    ///      until allowance is available again; the operator retries later.
    ///      Already allocated credits are never clawed back.
    function setDailyCapBps(uint16 capBps) external onlyOwner {
        if (capBps > HARD_MAX_DAILY_CAP_BPS) revert InvalidDailyCap(capBps);
        uint16 previousCapBps = dailyCapBps;
        dailyCapBps = capBps;
        emit DailyCapBpsUpdated(previousCapBps, capBps);
    }

    /// @notice Replaces the authorized ticket signer and gameplay reporter.
    function setOperator(address newOperator) external onlyOwner {
        if (newOperator == address(0)) revert ZeroAddress();
        address previousOperator = operator;
        operator = newOperator;
        emit OperatorUpdated(previousOperator, newOperator);
    }

    /// @notice Disables ownership renunciation; two-step ownership transfers remain available.
    function renounceOwnership() public pure override {
        revert RenounceDisabled();
    }

    /// @notice Stops entry, settlement and funding, but not claims or refunds.
    function pause() external onlyOwner { _pause(); }

    /// @notice Resumes entry, settlement and funding.
    function unpause() external onlyOwner { _unpause(); }

    /// @notice Recovers stray non-USDC ERC-20 tokens; USDC can never be rescued.
    function rescueToken(address token, address to, uint256 amount) external onlyOwner nonReentrant {
        if (token == address(usdc)) revert CannotRescueUSDC();
        if (token == address(0) || to == address(0)) revert ZeroAddress();
        IERC20(token).safeTransfer(to, amount);
        emit TokenRescued(token, to, amount);
    }

    /// @notice Returns the accounted prize pool, not the raw USDC balance.
    function poolBalance() external view returns (uint256) { return pool; }

    /// @notice Estimates a run's payout after five current entry fees join the pool.
    /// @dev Ignores daily allowance and leavers, but applies the fixed curve, minimum
    ///      floors, per-run cap and pool limit. Existing runs may have a different fee.
    function previewPayout(uint16 floors) external view returns (uint256) {
        return _basePayout(pool + uint256(entryFee) * RUN_SIZE, floors);
    }

    /// @notice Returns a permanent run record, including players in entry order.
    function runInfo(bytes32 runId)
        external
        view
        returns (
            RunState state,
            uint128 fee,
            uint8 entries,
            uint256 firstEntryAt,
            uint256 filledAt,
            address[5] memory players
        )
    {
        Run storage run = _runs[runId];
        return (run.state, run.fee, run.entries, run.firstEntryAt, run.filledAt, run.players);
    }

    /// @dev Applies the immutable curve and per-run/pool caps without daily limits.
    function _basePayout(uint256 availablePool, uint16 floors) private view returns (uint256 payout) {
        if (floors < MIN_FLOORS) return 0;
        uint256 rateBps = uint256(floors) * BPS_PER_FLOOR;
        if (rateBps > MAX_BPS) rateBps = MAX_BPS;
        payout = Math.mulDiv(availablePool, rateBps, BPS_DENOMINATOR);
        if (payout > maxPayoutPerRun) payout = maxPayoutPerRun;
        if (payout > availablePool) payout = availablePool;
    }

    /// @dev Lazily resets daily accounting on settlement, even for a zero-prize run.
    function _rollDay() private {
        uint256 today = block.timestamp / 1 days;
        if (today != dayIndex) {
            dayIndex = today;
            paidToday = 0;
            dayPoolSnapshot = 0;
            _daySnapshotSet = false;
        }
    }

    /// @dev Snapshots only the first positive allocation; zero-prize settlements
    ///      cannot lock a day's snapshot. Daily spending counts actual credits, so
    ///      division dust stays in pool and consumes no allowance.
    function _allocatePayout(Run storage run, uint16 floors, uint256 leaverMask, uint8 stayers)
        private
        returns (uint256 totalPaid)
    {
        uint256 payout = _basePayout(pool, floors);
        uint256 snapshot = _daySnapshotSet ? dayPoolSnapshot : pool;
        uint256 allowance = Math.mulDiv(snapshot, dailyCapBps, BPS_DENOMINATOR);
        if (payout > allowance) payout = allowance;
        uint256 remaining = allowance > paidToday ? allowance - paidToday : 0;
        if (payout > remaining) revert DailyCapReached(remaining, payout);
        uint256 perPlayer = payout / stayers;
        totalPaid = perPlayer * stayers;
        if (totalPaid == 0) return 0;

        if (!_daySnapshotSet) {
            dayPoolSnapshot = snapshot;
            _daySnapshotSet = true;
        }
        paidToday += totalPaid;
        pool -= totalPaid;
        totalCredits += totalPaid;
        for (uint256 i; i < RUN_SIZE; ++i) {
            if ((leaverMask & (uint256(1) << i)) == 0) credits[run.players[i]] += perPlayer;
        }
    }

    /// @dev Shared constructor and owner fee validation.
    function _validateEntryFee(uint128 fee) private pure {
        if (fee < MIN_ENTRY_FEE || fee > MAX_ENTRY_FEE) revert InvalidEntryFee(fee);
    }
}
