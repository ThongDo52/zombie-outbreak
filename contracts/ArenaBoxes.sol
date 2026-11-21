// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {D20VRFConsumer} from "@d20dao/vrf-sdk/contracts/D20VRFConsumer.sol";
import {ID20VRF} from "@d20dao/vrf-sdk/contracts/interfaces/ID20VRF.sol";

interface IRefund {
    function refundRequest(uint256 requestId) external;
}

/// @title Arena Rare Skins Mystery Boxes
/// @notice Buy a box with USDC, then settle its stored VRF result for one transferable skin.
/// @dev Randomness comes from the external D20DAO VRF service, which is not audited
///      by this project and is trusted as the randomness source. Fulfilled words are
///      stored permanently, including after opening; there is no reveal deadline.
///      Odds and pity rules are fixed at construction. Nothing in this contract lets
///      anyone reroll a request. Item pool sizes are snapshotted at purchase, so
///      owner-added items only affect future boxes. USDC is escrowed until opening
///      or a coordinator-confirmed refund; the owner cannot withdraw escrow. The
///      token must be genuine six-decimal USDC. No gameplay stats are stored.
contract ArenaBoxes is ERC1155, Ownable2Step, ReentrancyGuard, D20VRFConsumer {
    using SafeERC20 for IERC20;

    /// @notice Gas budget for the coordinator's storage-only fulfillment callback.
    uint32 public constant CALLBACK_GAS = 150_000;

    /// @notice Payment token, expected to be USDC with six decimals.
    IERC20 public immutable usdc;

    /// @notice Recipient of purchase payments when boxes are opened.
    address public treasury;

    /// @notice Price of one box in USDC base units (1 USDC = 1_000_000).
    uint128 public boxPrice;

    /// @notice Opens required to force Mythic; zero disables pity. Never changes.
    uint16 public immutable pityThreshold;

    /// @notice Constructor-fixed tier odds in basis points: Rare, Epic, Legendary, Mythic.
    /// @dev Sum is exactly 10_000. No function changes these values after construction.
    uint16[4] public oddsBps;

    struct Box {
        address buyer;
        uint128 price;
        bool fulfilled;
        bool refundable;
        bytes32 word;
        uint256[4] poolSizes;
        address rewardTo;
    }

    /// @notice Request records; fulfilled words remain available after settlement.
    mapping(uint256 => Box) public boxes;

    /// @notice Each buyer's unsettled request id; zero when none.
    mapping(address => uint256) public pendingRequest;

    /// @notice Buyer of an active request; cleared when opened or refunded.
    mapping(uint256 => address) public requestBuyer;

    /// @notice Opens since the last Mythic; refunds do not affect this counter.
    mapping(address => uint256) public pity;

    /// @notice Whether a cosmetic id is already assigned to a tier.
    mapping(uint256 => bool) public itemExists;

    mapping(uint8 => uint256[]) private tierItems;

    error ZeroAddress();
    error InvalidTreasury(address treasury);
    error InvalidPrice();
    error PriceTooHigh(uint256 price, uint256 maxPrice);
    error BoxAlreadyPending();
    error NoPendingBox();
    error BoxNotReady();
    error BoxNotRefundable();
    error IncorrectFee();
    error ChangeRefused();
    error UnexpectedCallback();
    error LengthMismatch();
    error InvalidOdds(uint256 total);
    error InvalidTier(uint8 tier);
    error DuplicateItem(uint256 id);
    error EmptyTier(uint8 tier);

    /// @notice Emitted after payment and the randomness request have succeeded.
    event BoxPurchased(address indexed buyer, uint256 indexed requestId, uint128 price, address rewardTo);

    /// @notice Emitted when a buyer changes the recipient of a pending box's skin.
    event RewardRecipientSet(address indexed buyer, uint256 indexed requestId, address newRecipient);

    /// @notice Emitted after the coordinator's word has been stored for opening.
    event BoxReady(address indexed buyer, uint256 indexed requestId);

    /// @notice Emitted after exactly one skin has been delivered.
    event BoxOpened(address indexed buyer, uint256 indexed itemId, uint8 tier, bool pityTriggered);

    /// @notice Emitted after the escrowed box price has been returned to its buyer.
    event BoxRefunded(address indexed buyer, uint256 indexed requestId, uint128 price);

    /// @notice Emitted when a cosmetic id is assigned to its permanent tier.
    event ItemAdded(uint256 indexed id, uint8 indexed tier);

    /// @notice Emitted when the price of future purchases changes.
    event BoxPriceUpdated(uint128 previousPrice, uint128 newPrice);

    /// @notice Emitted when the payment recipient changes.
    event TreasuryUpdated(address indexed previousTreasury, address indexed newTreasury);

    /// @notice Emitted when the shared ERC-1155 metadata URI changes.
    event BaseURIUpdated(string newURI);

    /// @notice Creates the box shop with fixed odds and pity rules.
    /// @param coordinator_ D20DAO VRF coordinator proxy on the target network.
    /// @param usdc_ Six-decimal USDC contract address.
    /// @param treasury_ Nonzero payment recipient other than this shop.
    /// @param owner_ Initial owner; ownership transfers require acceptance.
    /// @param boxPrice_ Positive price in USDC base units.
    /// @param pityThreshold_ Opens required to force Mythic, or zero to disable.
    /// @param odds_ Rare, Epic, Legendary, Mythic odds, summing to 10_000.
    /// @param itemIds Unique cosmetic ids; at least one per tier is required.
    /// @param itemTiers Tier of each corresponding cosmetic id, from zero to three.
    /// @dev Metadata starts empty; the owner can configure it with setURI.
    constructor(
        address coordinator_,
        address usdc_,
        address treasury_,
        address owner_,
        uint128 boxPrice_,
        uint16 pityThreshold_,
        uint16[4] memory odds_,
        uint256[] memory itemIds,
        uint8[] memory itemTiers
    ) ERC1155("") Ownable(owner_) D20VRFConsumer(coordinator_) {
        if (usdc_ == address(0) || treasury_ == address(0) || owner_ == address(0)) {
            revert ZeroAddress();
        }
        if (treasury_ == address(this)) revert InvalidTreasury(treasury_);
        if (boxPrice_ == 0) revert InvalidPrice();
        if (itemIds.length != itemTiers.length) revert LengthMismatch();

        uint256 total;
        for (uint256 i; i < 4; ++i) {
            total += odds_[i];
        }
        if (total != 10_000) revert InvalidOdds(total);

        usdc = IERC20(usdc_);
        treasury = treasury_;
        boxPrice = boxPrice_;
        pityThreshold = pityThreshold_;
        oddsBps = odds_;
        emit TreasuryUpdated(address(0), treasury_);
        emit BoxPriceUpdated(0, boxPrice_);

        for (uint256 i; i < itemIds.length; ++i) {
            _addItem(itemIds[i], itemTiers[i]);
        }
        for (uint8 tier; tier < 4; ++tier) {
            if (tierItems[tier].length == 0) revert EmptyTier(tier);
        }
    }

    /// @notice Returns the collection name.
    function name() external pure returns (string memory) {
        return "Arena Rare Skins";
    }

    /// @notice Returns the collection symbol.
    function symbol() external pure returns (string memory) {
        return "RARE";
    }

    /// @notice Purchases one unopened box within a maximum price for a chosen recipient.
    /// @dev Requires USDC allowance and native currency for the exact in-transaction
    ///      VRF quote. Excess native currency is returned immediately; an expired
    ///      request's VRF fee is refunded by the coordinator directly to the buyer
    ///      or recorded there as buyer credit, separately from this shop's USDC.
    /// @param maxPrice Maximum acceptable price in USDC base units.
    /// @param rewardTo Skin recipient; zero selects the buyer.
    function buyBox(uint256 maxPrice, address rewardTo) external payable nonReentrant {
        uint128 price = boxPrice;
        if (price > maxPrice) revert PriceTooHigh(price, maxPrice);
        if (pendingRequest[msg.sender] != 0) revert BoxAlreadyPending();
        if (rewardTo == address(0)) rewardTo = msg.sender;
        uint256[4] memory poolSizes;
        for (uint8 tier; tier < 4; ++tier) {
            poolSizes[tier] = tierItems[tier].length;
        }

        usdc.safeTransferFrom(msg.sender, address(this), uint256(price));
        uint256 fee = ID20VRF(vrfCoordinator).quoteFee(CALLBACK_GAS);
        if (msg.value < fee) revert IncorrectFee();
        uint256 requestId = ID20VRF(vrfCoordinator).requestRandomness{value: fee}(
            keccak256(abi.encode(msg.sender, block.number)), CALLBACK_GAS, msg.sender
        );
        boxes[requestId] = Box(msg.sender, price, false, false, bytes32(0), poolSizes, rewardTo);
        pendingRequest[msg.sender] = requestId;
        requestBuyer[requestId] = msg.sender;

        if (msg.value > fee) {
            (bool sent,) = payable(msg.sender).call{value: msg.value - fee}("");
            if (!sent) revert ChangeRefused();
        }
        emit BoxPurchased(msg.sender, requestId, price, rewardTo);
    }

    /// @notice Changes the skin recipient of your unsettled box, including after fulfillment.
    /// @param newRecipient Nonzero address that will receive the skin when opened.
    function setRewardRecipient(address newRecipient) external {
        uint256 requestId = pendingRequest[msg.sender];
        if (requestBuyer[requestId] != msg.sender) revert NoPendingBox();
        if (newRecipient == address(0)) revert ZeroAddress();
        boxes[requestId].rewardTo = newRecipient;
        emit RewardRecipientSet(msg.sender, requestId, newRecipient);
    }

    /// @dev Authenticated by D20VRFConsumer. Store only: never mint or transfer here.
    function _fulfillRandomness(uint256 requestId, bytes32 randomness) internal override {
        Box storage box = boxes[requestId];
        if (requestBuyer[requestId] == address(0) || box.fulfilled || box.refundable) {
            revert UnexpectedCallback();
        }
        box.word = randomness;
        box.fulfilled = true;
        emit BoxReady(box.buyer, requestId);
    }

    /// @notice Opens a fulfilled box for its chosen recipient; anyone can pay the settlement gas.
    /// @dev No deadline or expired downgrade applies. The stored word is never
    ///      replaced or deleted. Active state and pity are updated before transfers
    ///      and minting; a failed USDC transfer or receiver callback rolls it all back.
    /// @param buyer Buyer whose box is settled, regardless of who calls.
    function openBox(address buyer) external nonReentrant {
        uint256 requestId = pendingRequest[buyer];
        if (requestBuyer[requestId] != buyer || buyer == address(0)) revert NoPendingBox();
        Box storage box = boxes[requestId];
        if (!box.fulfilled || box.refundable) revert BoxNotReady();

        uint256 nextPity = pity[buyer] + 1;
        bool pityTriggered = pityThreshold != 0 && nextPity >= pityThreshold;
        uint8 tier = pityTriggered ? 3 : _tierForRoll(uint256(keccak256(abi.encode(box.word, "tier"))) % 10_000);
        uint256 itemId = tierItems[tier][uint256(keccak256(abi.encode(box.word, "item"))) % box.poolSizes[tier]];
        uint128 price = box.price;

        delete pendingRequest[buyer];
        delete requestBuyer[requestId];
        pity[buyer] = tier == 3 ? 0 : nextPity;
        usdc.safeTransfer(treasury, uint256(price));
        _mint(box.rewardTo, itemId, 1, "");
        emit BoxOpened(buyer, itemId, tier, pityTriggered);
    }

    /// @dev Authenticated by D20VRFConsumer. The hook never transfers funds.
    function _onRefund(uint256 requestId) internal override {
        Box storage box = boxes[requestId];
        if (requestBuyer[requestId] != address(0) && !box.fulfilled) {
            box.refundable = true;
        }
    }

    /// @notice Returns your escrowed USDC after a coordinator-confirmed refund.
    /// @dev Attempts coordinator expiration/refund if its notification has not yet
    ///      arrived. A failed attempt cannot authorize a refund, nor can a fulfilled
    ///      box be refunded. Coordinator fee refunds are separate from this payment.
    function refundBox() external nonReentrant {
        uint256 requestId = pendingRequest[msg.sender];
        if (requestBuyer[requestId] != msg.sender) revert NoPendingBox();
        Box storage box = boxes[requestId];
        if (box.fulfilled) revert BoxNotRefundable();
        if (!box.refundable) {
            try IRefund(vrfCoordinator).refundRequest(requestId) {} catch {}
        }
        if (!box.refundable || box.fulfilled) revert BoxNotRefundable();
        uint128 price = box.price;
        delete pendingRequest[msg.sender];
        delete requestBuyer[requestId];
        delete boxes[requestId];
        usdc.safeTransfer(msg.sender, uint256(price));
        emit BoxRefunded(msg.sender, requestId, price);
    }

    /// @notice Changes the price for future purchases, not already purchased boxes.
    /// @param price Positive price in USDC base units.
    function setBoxPrice(uint128 price) external onlyOwner {
        if (price == 0) revert InvalidPrice();
        uint128 previousPrice = boxPrice;
        boxPrice = price;
        emit BoxPriceUpdated(previousPrice, price);
    }

    /// @notice Changes the payment recipient for subsequent box openings.
    /// @param newTreasury Nonzero treasury other than this contract.
    function setTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert ZeroAddress();
        if (newTreasury == address(this)) revert InvalidTreasury(newTreasury);
        address previousTreasury = treasury;
        treasury = newTreasury;
        emit TreasuryUpdated(previousTreasury, newTreasury);
    }

    /// @notice Updates the shared ERC-1155 metadata URI template.
    /// @param newURI Metadata URI, optionally containing the ERC-1155 {id} placeholder.
    function setURI(string memory newURI) external onlyOwner {
        _setURI(newURI);
        emit BaseURIUpdated(newURI);
    }

    /// @notice Permanently appends a new cosmetic to a tier for future boxes.
    /// @param id Cosmetic id not already in any tier.
    /// @param tier Zero Rare, one Epic, two Legendary, or three Mythic.
    function addItem(uint256 id, uint8 tier) external onlyOwner {
        _addItem(id, tier);
    }

    /// @notice Returns all cosmetic ids currently in a tier.
    /// @param tier Tier from zero to three.
    function tierItemsOf(uint8 tier) external view returns (uint256[] memory) {
        if (tier > 3) revert InvalidTier(tier);
        return tierItems[tier];
    }

    /// @notice Returns a pending box's status, escrowed price, and recipient; all zero if none.
    /// @param account Buyer whose pending box is queried.
    function pendingOf(address account)
        external
        view
        returns (uint256 requestId, bool fulfilled, bool refundable, uint128 price, address rewardTo)
    {
        requestId = pendingRequest[account];
        if (account == address(0) || requestBuyer[requestId] != account) return (0, false, false, 0, address(0));
        Box storage box = boxes[requestId];
        return (requestId, box.fulfilled, box.refundable, box.price, box.rewardTo);
    }

    /// @notice Returns one account's balances for multiple cosmetic ids.
    /// @param account Address whose ownership is queried.
    /// @param ids Cosmetic ids in the desired result order.
    /// @return balances Balances corresponding to ids, in the same order.
    function balancesOf(address account, uint256[] calldata ids)
        external
        view
        returns (uint256[] memory balances)
    {
        balances = new uint256[](ids.length);
        for (uint256 i; i < ids.length; ++i) {
            balances[i] = balanceOf(account, ids[i]);
        }
    }

    /// @dev Validates and permanently assigns an id to one tier.
    function _addItem(uint256 id, uint8 tier) private {
        if (tier > 3) revert InvalidTier(tier);
        if (itemExists[id]) revert DuplicateItem(id);
        itemExists[id] = true;
        tierItems[tier].push(id);
        emit ItemAdded(id, tier);
    }

    /// @dev Maps a roll in [0, 9999] to the constructor-fixed cumulative odds.
    function _tierForRoll(uint256 roll) private view returns (uint8) {
        uint256 cumulative;
        for (uint8 tier; tier < 3; ++tier) {
            cumulative += oddsBps[tier];
            if (roll < cumulative) return tier;
        }
        return 3;
    }
}
