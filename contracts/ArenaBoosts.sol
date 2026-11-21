// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title Arena Boosts
/// @notice Nontransferable purchase credits for single-use zombie-shooter boosts.
/// @dev The game tracks consumption offchain; credits are cumulative purchases,
///      not spendable tokens or remaining uses. Payments go directly to treasury.
///      The supplied token must be genuine six-decimal USDC; decimals are not queried.
contract ArenaBoosts is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Boost price in USDC base units and whether purchases are enabled.
    struct Boost {
        uint128 price;
        bool active;
    }

    /// @notice Payment token, expected to be USDC with six decimals.
    IERC20 public immutable usdc;

    /// @notice Recipient of all purchase payments.
    address public treasury;

    /// @notice Minimum interval between purchases, shared across all boost ids.
    uint64 public constant COOLDOWN = 1 days;

    /// @notice Current configuration for each boost id.
    mapping(uint256 => Boost) public boosts;

    /// @notice Timestamp of each wallet's last successful purchase; zero means none.
    mapping(address => uint64) public lastPurchaseAt;

    /// @notice Cumulative purchases per wallet and boost id; consumption is offchain.
    mapping(address => mapping(uint256 => uint32)) public credits;

    // A configured inactive boost may legitimately have price zero.
    mapping(uint256 => bool) private _configured;

    error ZeroAddress();
    error InvalidTreasury(address treasury);
    error LengthMismatch();
    error DuplicateBoost(uint256 id);
    error InvalidPrice(uint256 id);
    error PriceTooHigh(uint256 price, uint256 maxPrice);
    error BoostNotFound(uint256 id);
    error BoostInactive(uint256 id);
    error CooldownActive(uint256 nextPurchaseAt);

    /// @notice Emitted when a boost is added or its configuration changes.
    event BoostConfigured(uint256 indexed id, uint128 price, bool active);

    /// @notice Emitted after successful payment for one boost credit.
    event BoostPurchased(address indexed buyer, uint256 indexed id, uint128 price, uint32 newCredits);

    /// @notice Emitted when the payment recipient changes.
    event TreasuryUpdated(address indexed previousTreasury, address indexed newTreasury);

    /// @notice Creates the shop and configures all initial boosts as active.
    /// @param usdc_ Six-decimal USDC contract address.
    /// @param treasury_ Nonzero payment recipient other than this shop.
    /// @param owner_ Initial owner; subsequent ownership transfers require acceptance.
    /// @param ids Unique boost ids; gameplay meanings are assigned offchain.
    /// @param prices Positive prices in USDC base units (1 USDC = 1_000_000).
    constructor(
        address usdc_,
        address treasury_,
        address owner_,
        uint256[] memory ids,
        uint128[] memory prices
    ) Ownable(owner_) {
        if (usdc_ == address(0) || treasury_ == address(0) || owner_ == address(0)) {
            revert ZeroAddress();
        }
        if (treasury_ == address(this)) revert InvalidTreasury(treasury_);
        if (ids.length != prices.length) revert LengthMismatch();

        usdc = IERC20(usdc_);
        treasury = treasury_;
        emit TreasuryUpdated(address(0), treasury_);

        for (uint256 i; i < ids.length; ++i) {
            uint256 id = ids[i];
            if (_configured[id]) revert DuplicateBoost(id);
            if (prices[i] == 0) revert InvalidPrice(id);
            _configured[id] = true;
            boosts[id] = Boost(prices[i], true);
            emit BoostConfigured(id, prices[i], true);
        }
    }

    /// @notice Purchases one boost credit for yourself within a maximum price.
    /// @dev Requires a USDC allowance from msg.sender. The cooldown applies across
    ///      all ids. Effects precede payment and roll back if payment fails.
    /// @param id Boost to purchase.
    /// @param maxPrice Maximum acceptable price in USDC base units.
    function buy(uint256 id, uint256 maxPrice) external nonReentrant {
        if (!_configured[id]) revert BoostNotFound(id);
        Boost storage boost = boosts[id];
        if (!boost.active) revert BoostInactive(id);

        uint128 price = boost.price;
        if (price > maxPrice) revert PriceTooHigh(price, maxPrice);

        uint64 lastPurchase = lastPurchaseAt[msg.sender];
        uint256 availableAt = uint256(lastPurchase) + COOLDOWN;
        if (lastPurchase != 0 && block.timestamp < availableAt) {
            revert CooldownActive(availableAt);
        }

        lastPurchaseAt[msg.sender] = uint64(block.timestamp);
        credits[msg.sender][id] += 1;
        uint32 newCredits = credits[msg.sender][id];
        usdc.safeTransferFrom(msg.sender, treasury, uint256(price));
        emit BoostPurchased(msg.sender, id, price, newCredits);
    }

    /// @notice Adds or retunes a boost without changing credits or cooldowns.
    /// @param id Boost id to configure.
    /// @param price Price in USDC base units; must be positive when active.
    /// @param active Whether purchases are enabled.
    function setBoost(uint256 id, uint128 price, bool active) external onlyOwner {
        if (active && price == 0) revert InvalidPrice(id);
        _configured[id] = true;
        boosts[id] = Boost(price, active);
        emit BoostConfigured(id, price, active);
    }

    /// @notice Changes the payment recipient; purchases never route funds through this shop.
    /// @param newTreasury Nonzero treasury other than this contract.
    function setTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert ZeroAddress();
        if (newTreasury == address(this)) revert InvalidTreasury(newTreasury);
        address previousTreasury = treasury;
        treasury = newTreasury;
        emit TreasuryUpdated(previousTreasury, newTreasury);
    }

    /// @notice Returns when a wallet can next purchase, or zero if it may buy now.
    /// @param account Wallet whose cooldown is queried.
    /// @return timestamp End of the active cooldown, or zero if none is active.
    function nextPurchaseAt(address account) external view returns (uint256 timestamp) {
        uint64 lastPurchase = lastPurchaseAt[account];
        if (lastPurchase == 0) return 0;
        uint256 availableAt = uint256(lastPurchase) + COOLDOWN;
        return block.timestamp < availableAt ? availableAt : 0;
    }

    /// @notice Returns one wallet's cumulative purchase credits for multiple boosts.
    /// @param account Wallet whose credits are queried.
    /// @param ids Boost ids in the desired result order.
    /// @return balances Credits corresponding to ids, in the same order.
    function creditsOf(address account, uint256[] calldata ids)
        external
        view
        returns (uint256[] memory balances)
    {
        balances = new uint256[](ids.length);
        for (uint256 i; i < ids.length; ++i) {
            balances[i] = credits[account][ids[i]];
        }
    }
}
