// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title Arena Skins
/// @notice Transferable cosmetic skins for a zombie shooter, purchased with USDC.
/// @dev No gameplay stats are stored. Purchases pay the treasury directly. The
///      supplied token must be genuine six-decimal USDC; decimals are not queried.
contract ArenaSkins is ERC1155, Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Prices are USDC base units; a zero maxSupply means unlimited.
    /// @dev minted is lifetime issuance, not the number of current holders.
    struct Skin {
        uint128 price;
        uint32 maxSupply;
        uint32 minted;
        bool active;
    }

    /// @notice Payment token, expected to be USDC with six decimals.
    IERC20 public immutable usdc;

    /// @notice Recipient of all purchase payments.
    address public treasury;

    /// @notice Current configuration and lifetime issuance for each cosmetic id.
    mapping(uint256 => Skin) public skins;

    // A configured inactive skin may legitimately have price zero.
    mapping(uint256 => bool) private _configured;

    error ZeroAddress();
    error InvalidTreasury(address treasury);
    error LengthMismatch();
    error DuplicateSkin(uint256 id);
    error InvalidPrice(uint256 id);
    error PriceTooHigh(uint256 price, uint256 maxPrice);
    error SkinNotFound(uint256 id);
    error SkinInactive(uint256 id);
    error AlreadyOwned(address account, uint256 id);
    error SoldOut(uint256 id);
    error MaxSupplyBelowMinted(uint256 id, uint32 maxSupply, uint32 minted);

    /// @notice Emitted when a skin is added or its configuration changes.
    event SkinConfigured(uint256 indexed id, uint128 price, uint32 maxSupply, bool active);

    /// @notice Emitted after payment and successful delivery of a skin.
    event SkinPurchased(address indexed buyer, address indexed to, uint256 indexed id, uint128 price);

    /// @notice Emitted when the payment recipient changes.
    event TreasuryUpdated(address indexed previousTreasury, address indexed newTreasury);

    /// @notice Emitted when the shared ERC-1155 metadata URI changes.
    event BaseURIUpdated(string newURI);

    /// @notice Creates the shop and configures all initial skins as active.
    /// @param usdc_ Six-decimal USDC contract address.
    /// @param treasury_ Nonzero payment recipient other than this shop.
    /// @param owner_ Initial owner; subsequent ownership transfers require acceptance.
    /// @param ids Unique cosmetic ids, each defining a separate ERC-1155 token.
    /// @param prices Positive prices in USDC base units (1 USDC = 1_000_000).
    /// @param maxSupplies Lifetime mint limits; zero means unlimited.
    constructor(
        address usdc_,
        address treasury_,
        address owner_,
        uint256[] memory ids,
        uint128[] memory prices,
        uint32[] memory maxSupplies
    ) ERC1155("https://arena-skins.example/{id}.json") Ownable(owner_) {
        if (usdc_ == address(0) || treasury_ == address(0) || owner_ == address(0)) {
            revert ZeroAddress();
        }
        if (treasury_ == address(this)) revert InvalidTreasury(treasury_);
        if (ids.length != prices.length || ids.length != maxSupplies.length) {
            revert LengthMismatch();
        }

        usdc = IERC20(usdc_);
        treasury = treasury_;
        emit TreasuryUpdated(address(0), treasury_);

        for (uint256 i; i < ids.length; ++i) {
            uint256 id = ids[i];
            if (_configured[id]) revert DuplicateSkin(id);
            if (prices[i] == 0) revert InvalidPrice(id);
            _configured[id] = true;
            skins[id] = Skin(prices[i], maxSupplies[i], 0, true);
            emit SkinConfigured(id, prices[i], maxSupplies[i], true);
        }
    }

    /// @notice Returns the collection name.
    function name() external pure returns (string memory) {
        return "Arena Skins";
    }

    /// @notice Returns the collection symbol.
    function symbol() external pure returns (string memory) {
        return "SKIN";
    }

    /// @notice Purchases one skin for yourself or as a gift within a maximum price.
    /// @dev Requires a USDC allowance from msg.sender. Only purchases enforce
    ///      one copy per recipient; normal ERC-1155 transfers remain unrestricted.
    ///      Reverts with PriceTooHigh if the current price exceeds maxPrice.
    ///      Issuance is recorded before payment and the ERC-1155 receiver callback.
    /// @param id Cosmetic to purchase.
    /// @param to Nonzero recipient who does not currently own this skin.
    /// @param maxPrice Maximum acceptable price in USDC base units.
    function buy(uint256 id, address to, uint256 maxPrice) external nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        if (!_configured[id]) revert SkinNotFound(id);
        Skin storage skin = skins[id];
        if (!skin.active) revert SkinInactive(id);
        if (balanceOf(to, id) > 0) revert AlreadyOwned(to, id);
        if (skin.maxSupply != 0 && skin.minted >= skin.maxSupply) revert SoldOut(id);

        uint128 price = skin.price;
        if (price > maxPrice) revert PriceTooHigh(price, maxPrice);
        skin.minted += 1;
        usdc.safeTransferFrom(msg.sender, treasury, uint256(price));
        _mint(to, id, 1, "");
        emit SkinPurchased(msg.sender, to, id, price);
    }

    /// @notice Adds or retunes a skin without changing lifetime issuance.
    /// @param id Cosmetic id to configure.
    /// @param price Price in USDC base units; must be positive when active.
    /// @param maxSupply Lifetime mint limit (zero for unlimited), never below minted.
    /// @param active Whether purchases are enabled; transfers are unaffected.
    function setSkin(uint256 id, uint128 price, uint32 maxSupply, bool active) external onlyOwner {
        Skin storage skin = skins[id];
        if (active && price == 0) revert InvalidPrice(id);
        if (maxSupply != 0 && maxSupply < skin.minted) {
            revert MaxSupplyBelowMinted(id, maxSupply, skin.minted);
        }

        _configured[id] = true;
        skin.price = price;
        skin.maxSupply = maxSupply;
        skin.active = active;
        emit SkinConfigured(id, price, maxSupply, active);
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

    /// @notice Updates the shared ERC-1155 metadata URI template.
    /// @param newURI Metadata URI, optionally containing the ERC-1155 {id} placeholder.
    function setURI(string memory newURI) external onlyOwner {
        _setURI(newURI);
        emit BaseURIUpdated(newURI);
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
}
