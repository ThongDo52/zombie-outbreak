// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import {IERC1155Receiver} from "@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {ERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";

/// @title Arena Market
/// @notice Fixed-price resale of exactly one escrowed cosmetic ERC-1155 token per listing.
/// @dev Payments go directly to seller and treasury. The supplied payment token must
///      be genuine six-decimal USDC; decimals are not queried. Allowed collections
///      are trusted to implement ERC-1155 transfers faithfully. No admin withdrawal,
///      admin cancellation, pausing, or upgrade mechanism exists.
contract ArenaMarket is Ownable2Step, ReentrancyGuard, ERC165, IERC1155Receiver {
    using SafeERC20 for IERC20;

    /// @notice One escrowed token and its sale terms; inactive records remain queryable.
    struct Listing {
        address seller;
        address collection;
        uint128 price;
        uint256 tokenId;
        bool active;
    }

    /// @notice Minimum price, 0.01 USDC in six-decimal base units.
    uint128 public constant MIN_PRICE = 10_000;

    /// @notice Maximum marketplace fee, 10% in basis points.
    uint16 public constant MAX_FEE_BPS = 1000;

    /// @notice Payment token, expected to be USDC with six decimals.
    IERC20 public immutable usdc;

    /// @notice Nonzero recipient of marketplace fees, never this contract.
    address public treasury;

    /// @notice Fee applied at purchase time, rather than locked at listing time.
    uint16 public feeBps;

    /// @notice Collections currently permitted for listing and buying.
    mapping(address => bool) public allowedCollection;

    /// @notice All listing records, including completed and cancelled listings.
    mapping(uint256 => Listing) public listings;

    /// @notice Next unused listing id; ids start at one.
    uint256 public nextListingId = 1;

    /// @notice Number of currently active listings.
    uint256 public activeCount;

    /// @notice Lifetime count of successfully completed sales.
    uint256 public totalSales;

    /// @notice Lifetime gross sale volume in USDC base units, including fees.
    uint256 public totalVolume;

    // Nonzero only while list() awaits its single, exact ERC-1155 receipt.
    bytes32 private _expectedReceipt;

    error ZeroAddress();
    error InvalidTreasury(address treasury);
    error InvalidCollection(address collection);
    error EmptyCollections();
    error CollectionNotAllowed(address collection);
    error InvalidPrice();
    error ListingNotActive();
    error NotSeller();
    error CannotBuyOwnListing();
    error PriceTooHigh(uint256 price, uint256 maxPrice);
    error FeeTooHigh(uint16 feeBps);
    error UnexpectedReceipt();

    /// @notice Emitted after one token has been escrowed for sale.
    event Listed(
        uint256 indexed listingId,
        address indexed seller,
        address indexed collection,
        uint256 tokenId,
        uint128 price
    );

    /// @notice Emitted after payment and delivery both succeed.
    event Sale(
        uint256 indexed listingId,
        address indexed seller,
        address indexed buyer,
        address collection,
        uint256 tokenId,
        uint128 price,
        uint256 fee
    );

    /// @notice Emitted after the seller's escrowed token has been returned.
    event Cancelled(uint256 indexed listingId);

    /// @notice Emitted when a seller changes an active listing's price.
    event PriceUpdated(uint256 indexed listingId, uint128 oldPrice, uint128 newPrice);

    /// @notice Emitted when a collection's listing and purchase permission changes.
    event CollectionUpdated(address indexed collection, bool allowed);

    /// @notice Emitted when the fee for subsequent sales changes.
    event FeeBpsUpdated(uint16 previousFeeBps, uint16 newFeeBps);

    /// @notice Emitted when the fee recipient changes.
    event TreasuryUpdated(address indexed previousTreasury, address indexed newTreasury);

    /// @notice Creates the market with an initial collection allowlist.
    /// @param usdc_ Six-decimal USDC contract address.
    /// @param treasury_ Nonzero fee recipient other than this contract.
    /// @param owner_ Initial owner; subsequent ownership transfers require acceptance.
    /// @param feeBps_ Initial sale fee in basis points, at most MAX_FEE_BPS (250 is 2.5%).
    /// @param collections Initial allowed ERC-1155 collections; at least one is required.
    constructor(
        address usdc_,
        address treasury_,
        address owner_,
        uint16 feeBps_,
        address[] memory collections
    ) Ownable(owner_) {
        if (usdc_ == address(0) || treasury_ == address(0) || owner_ == address(0)) {
            revert ZeroAddress();
        }
        if (treasury_ == address(this)) revert InvalidTreasury(treasury_);
        if (feeBps_ > MAX_FEE_BPS) revert FeeTooHigh(feeBps_);
        if (collections.length == 0) revert EmptyCollections();

        usdc = IERC20(usdc_);
        treasury = treasury_;
        feeBps = feeBps_;
        emit TreasuryUpdated(address(0), treasury_);
        emit FeeBpsUpdated(0, feeBps_);

        for (uint256 i; i < collections.length; ++i) {
            _setCollection(collections[i], true);
        }
    }

    /// @notice Escrows exactly one token at a fixed price.
    /// @dev Requires the seller's setApprovalForAll approval for this market.
    ///      Only the exact receipt initiated here is accepted by the receiver hook.
    /// @param collection Allowed ERC-1155 collection.
    /// @param tokenId Cosmetic id to escrow.
    /// @param price Asking price in USDC base units, at least MIN_PRICE.
    /// @return listingId Newly allocated listing id.
    function list(address collection, uint256 tokenId, uint128 price)
        external
        nonReentrant
        returns (uint256 listingId)
    {
        if (!allowedCollection[collection]) revert CollectionNotAllowed(collection);
        if (price < MIN_PRICE) revert InvalidPrice();

        listingId = nextListingId++;
        listings[listingId] = Listing(msg.sender, collection, price, tokenId, true);
        activeCount += 1;
        _expectedReceipt = keccak256(abi.encode(collection, msg.sender, tokenId));
        IERC1155(collection).safeTransferFrom(msg.sender, address(this), tokenId, 1, "");
        if (_expectedReceipt != bytes32(0)) revert UnexpectedReceipt();

        emit Listed(listingId, msg.sender, collection, tokenId, price);
    }

    /// @notice Buys an active listing without exceeding the buyer's maximum price.
    /// @dev Requires USDC allowance for the full price. State changes precede all
    ///      transfers; any failed payment or delivery rolls the transaction back.
    ///      Fee and treasury are snapshotted before external interactions.
    /// @param listingId Listing to buy.
    /// @param maxPrice Maximum acceptable gross price in USDC base units.
    function buy(uint256 listingId, uint256 maxPrice) external nonReentrant {
        Listing memory listing = listings[listingId];
        if (!listing.active) revert ListingNotActive();
        if (listing.price > maxPrice) revert PriceTooHigh(listing.price, maxPrice);
        if (msg.sender == listing.seller) revert CannotBuyOwnListing();
        if (!allowedCollection[listing.collection]) revert CollectionNotAllowed(listing.collection);

        listings[listingId].active = false;
        activeCount -= 1;
        totalSales += 1;
        totalVolume += listing.price;
        uint256 fee = uint256(listing.price) * feeBps / 10_000;
        address feeRecipient = treasury;

        usdc.safeTransferFrom(msg.sender, listing.seller, uint256(listing.price) - fee);
        if (fee > 0) usdc.safeTransferFrom(msg.sender, feeRecipient, fee);
        IERC1155(listing.collection).safeTransferFrom(address(this), msg.sender, listing.tokenId, 1, "");
        emit Sale(
            listingId, listing.seller, msg.sender, listing.collection, listing.tokenId, listing.price, fee
        );
    }

    /// @notice Cancels your active listing and returns its single escrowed token.
    /// @dev Remains available even after the collection is disallowed.
    /// @param listingId Listing owned by the caller.
    function cancel(uint256 listingId) external nonReentrant {
        Listing memory listing = listings[listingId];
        if (!listing.active) revert ListingNotActive();
        if (msg.sender != listing.seller) revert NotSeller();

        listings[listingId].active = false;
        activeCount -= 1;
        IERC1155(listing.collection).safeTransferFrom(address(this), listing.seller, listing.tokenId, 1, "");
        emit Cancelled(listingId);
    }

    /// @notice Changes the asking price of your active listing.
    /// @param listingId Listing owned by the caller.
    /// @param newPrice New asking price in USDC base units, at least MIN_PRICE.
    function updatePrice(uint256 listingId, uint128 newPrice) external nonReentrant {
        Listing storage listing = listings[listingId];
        if (!listing.active) revert ListingNotActive();
        if (msg.sender != listing.seller) revert NotSeller();
        if (newPrice < MIN_PRICE) revert InvalidPrice();

        uint128 oldPrice = listing.price;
        listing.price = newPrice;
        emit PriceUpdated(listingId, oldPrice, newPrice);
    }

    /// @notice Allows or disallows a collection for future listings and sales.
    /// @dev Disallowing a collection never prevents seller cancellation.
    /// @param collection Nonzero collection address other than this contract.
    /// @param allowed Whether listings and purchases are enabled.
    function setCollection(address collection, bool allowed) external onlyOwner {
        _setCollection(collection, allowed);
    }

    /// @notice Changes the fee applied to subsequent sales, including existing listings.
    /// @param newFeeBps New fee in basis points, at most MAX_FEE_BPS.
    function setFeeBps(uint16 newFeeBps) external onlyOwner {
        if (newFeeBps > MAX_FEE_BPS) revert FeeTooHigh(newFeeBps);
        uint16 previousFeeBps = feeBps;
        feeBps = newFeeBps;
        emit FeeBpsUpdated(previousFeeBps, newFeeBps);
    }

    /// @notice Changes the recipient of fees for subsequent sales.
    /// @param newTreasury Nonzero treasury other than this contract.
    function setTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert ZeroAddress();
        if (newTreasury == address(this)) revert InvalidTreasury(newTreasury);
        address previousTreasury = treasury;
        treasury = newTreasury;
        emit TreasuryUpdated(previousTreasury, newTreasury);
    }

    /// @notice Returns consecutive records, including inactive ones, for frontend filtering.
    /// @dev Range is [fromId, min(fromId + limit, nextListingId)), without addition
    ///      overflow. From id zero includes the unused, zero-valued record at id zero.
    /// @param fromId First id to return; at or beyond nextListingId returns an empty page.
    /// @param limit Maximum number of records to return; zero returns an empty page.
    /// @return ids Listing ids corresponding to page entries.
    /// @return page Listing records in ascending id order.
    function listingsPage(uint256 fromId, uint256 limit)
        external
        view
        returns (uint256[] memory ids, Listing[] memory page)
    {
        uint256 count;
        if (fromId < nextListingId) {
            uint256 remaining = nextListingId - fromId;
            count = limit < remaining ? limit : remaining;
        }
        ids = new uint256[](count);
        page = new Listing[](count);
        for (uint256 i; i < count; ++i) {
            uint256 id = fromId + i;
            ids[i] = id;
            page[i] = listings[id];
        }
    }

    /// @notice Accepts only the exact single-token transfer currently pulled by list().
    /// @dev Consumes the expected receipt, preventing duplicate or unsolicited callbacks.
    function onERC1155Received(address operator, address from, uint256 id, uint256 value, bytes calldata)
        external
        override
        returns (bytes4)
    {
        if (
            operator != address(this) || !allowedCollection[msg.sender] || value != 1
                || _expectedReceipt == bytes32(0)
                || _expectedReceipt != keccak256(abi.encode(msg.sender, from, id))
        ) revert UnexpectedReceipt();
        delete _expectedReceipt;
        return IERC1155Receiver.onERC1155Received.selector;
    }

    /// @notice Always rejects batch transfers; every listing escrows exactly one token.
    function onERC1155BatchReceived(address, address, uint256[] calldata, uint256[] calldata, bytes calldata)
        external
        pure
        override
        returns (bytes4)
    {
        revert UnexpectedReceipt();
    }

    /// @notice Reports ERC-1155 receiver and ERC-165 interface support.
    function supportsInterface(bytes4 interfaceId) public view override(ERC165, IERC165) returns (bool) {
        return interfaceId == type(IERC1155Receiver).interfaceId || super.supportsInterface(interfaceId);
    }

    /// @dev Shared constructor and owner allowlist validation.
    function _setCollection(address collection, bool allowed) private {
        if (collection == address(0)) revert ZeroAddress();
        if (collection == address(this)) revert InvalidCollection(collection);
        allowedCollection[collection] = allowed;
        emit CollectionUpdated(collection, allowed);
    }
}
