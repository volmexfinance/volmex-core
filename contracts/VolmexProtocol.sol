// SPDX-License-Identifier: BUSL-1.1

pragma solidity =0.8.2;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

import "./interfaces/IERC20Modified.sol";
import "./library/VolmexSafeERC20.sol";

/**
 * @title Protocol Contract
 * @author Volmex [security@volmexlabs.com]
 */
contract VolmexProtocol is
    Initializable,
    OwnableUpgradeable,
    ReentrancyGuardUpgradeable
{
    using VolmexSafeERC20 for IERC20Modified;

    event ToggleActivated(bool isActive);
    event UpdatedVolatilityToken(
        address indexed positionToken,
        bool isVolatilityIndexToken
    );
    event UpdatedFees(uint256 issuanceFees, uint256 redeemFees);
    event UpdatedMinimumCollateral(uint256 newMinimumCollateralQty);
    event ClaimedFees(uint256 fees);
    event ToggledVolatilityTokenPause(bool isPause);
    event Settled(uint256 settlementPrice);
    event Collateralized(
        address indexed sender,
        uint256 collateralLock,
        uint256 positionTokensMinted,
        uint256 fees
    );
    event Redeemed(
        address indexed sender,
        uint256 collateralReleased,
        uint256 volatilityIndexTokenBurned,
        uint256 inverseVolatilityIndexTokenBurned,
        uint256 fees
    );

    // Has the value of minimum collateral qty required
    uint256 public minimumCollateralQty;

    // Has the boolean state of protocol
    bool public active;

    // Has the boolean state of protocol settlement
    bool public isSettled;

    // Volatility tokens
    IERC20Modified public volatilityToken;
    IERC20Modified public inverseVolatilityToken;

    // Only ERC20 standard functions are used by the collateral defined here.
    // Address of the acceptable collateral token.
    IERC20Modified public collateral;

    // Used to calculate collateralize fee
    uint256 public issuanceFees;

    // Used to calculate redeem fee
    uint256 public redeemFees;

    // Total fee amount for call of collateralize and redeem
    uint256 public accumulatedFees;

    // Percentage value is upto two decimal places, so we're dividing it by 10000
    // Set the max fee as 5%, i.e. 500/10000.
    uint256 constant MAX_FEE = 500;

    // No need to add 18 decimals, because they are already considered in respective token qty arguments.
    uint256 public volatilityCapRatio;

    // This is the price of volatility index, ranges from 0 to volatilityCapRatio,
    // and the inverse can be calculated by subtracting volatilityCapRatio by settlementPrice.
    uint256 public settlementPrice;

    /**
     * @notice Used to check contract is active
     */
    modifier onlyActive() {
        require(active, "Volmex: Protocol not active");
        _;
    }

    /**
     * @notice Used to check contract is not settled
     */
    modifier onlyNotSettled() {
        require(!isSettled, "Volmex: Protocol settled");
        _;
    }

    /**
     * @notice Used to check contract is settled
     */
    modifier onlySettled() {
        require(isSettled, "Volmex: Protocol not settled");
        _;
    }

    /**
     * @dev Makes the protocol `active` at deployment
     * @dev Sets the `minimumCollateralQty`
     * @dev Makes the collateral token as `collateral`
     * @dev Assign position tokens
     * @dev Sets the `volatilityCapRatio`
     *
     * @param _collateralTokenAddress is address of collateral token typecasted to IERC20Modified
     * @param _volatilityToken is address of volatility index token typecasted to IERC20Modified
     * @param _inverseVolatilityToken is address of inverse volatility index token typecasted to IERC20Modified
     * @param _minimumCollateralQty is the minimum qty of tokens need to mint 0.1 volatility and inverse volatility tokens
     * @param _volatilityCapRatio is the cap for volatility
     */
    function initialize(
        IERC20Modified _collateralTokenAddress,
        IERC20Modified _volatilityToken,
        IERC20Modified _inverseVolatilityToken,
        uint256 _minimumCollateralQty,
        uint256 _volatilityCapRatio
    ) external initializer {
        __Ownable_init();
        __ReentrancyGuard_init();

        require(
            _minimumCollateralQty > 0,
            "Volmex: Minimum collateral quantity should be greater than 0"
        );

        active = true;
        minimumCollateralQty = _minimumCollateralQty;
        collateral = _collateralTokenAddress;
        volatilityToken = _volatilityToken;
        inverseVolatilityToken = _inverseVolatilityToken;
        volatilityCapRatio = _volatilityCapRatio;
    }

    /**
     * @notice Toggles the active variable. Restricted to only the owner of the contract.
     */
    function toggleActive() external onlyOwner {
        active = !active;
        emit ToggleActivated(active);
    }

    /**
     * @notice Update the `minimumCollateralQty`
     * @param _newMinimumCollQty Provides the new minimum collateral quantity
     */
    function updateMinimumCollQty(uint256 _newMinimumCollQty)
        external
        onlyOwner
    {
        require(
            _newMinimumCollQty > 0,
            "Volmex: Minimum collateral quantity should be greater than 0"
        );
        minimumCollateralQty = _newMinimumCollQty;
        emit UpdatedMinimumCollateral(_newMinimumCollQty);
    }

    /**
     * @notice Update the {Volatility Token}
     * @param _positionToken Address of the new position token
     * @param _isVolatilityIndexToken Type of the position token, { VolatilityIndexToken: true, InverseVolatilityIndexToken: false }
     */
    function updateVolatilityToken(
        address _positionToken,
        bool _isVolatilityIndexToken
    ) external onlyOwner {
        _isVolatilityIndexToken
            ? volatilityToken = IERC20Modified(_positionToken)
            : inverseVolatilityToken = IERC20Modified(_positionToken);
        emit UpdatedVolatilityToken(_positionToken, _isVolatilityIndexToken);
    }

    /**
     * @notice Add collateral to the protocol and mint the position tokens
     * @param _collateralQty Quantity of the collateral being deposited
     *
     * NOTE: Collateral quantity should be at least required minimum collateral quantity
     *
     * Calculation: Get the quantity for position token
     * Mint the position token for `msg.sender`
     *
     */
    function collateralize(uint256 _collateralQty)
        external
        onlyActive
        onlyNotSettled
    {
        require(
            _collateralQty >= minimumCollateralQty,
            "Volmex: CollateralQty > minimum qty required"
        );

        // Mechanism to calculate the collateral qty using the increase in balance
        // of protocol contract to counter USDT's fee mechanism, which can be enabled in future
        uint256 initialProtocolBalance = collateral.balanceOf(address(this));
        collateral.safeTransferFrom(msg.sender, address(this), _collateralQty);
        uint256 finalProtocolBalance = collateral.balanceOf(address(this));

        _collateralQty = finalProtocolBalance - initialProtocolBalance;

        uint256 fee;
        if (issuanceFees > 0) {
            fee = (_collateralQty * issuanceFees) / 10000;
            _collateralQty = _collateralQty - fee;
            accumulatedFees = accumulatedFees + fee;
        }

        uint256 qtyToBeMinted = _collateralQty / volatilityCapRatio;

        volatilityToken.mint(msg.sender, qtyToBeMinted);
        inverseVolatilityToken.mint(msg.sender, qtyToBeMinted);

        emit Collateralized(msg.sender, _collateralQty, qtyToBeMinted, fee);
    }

    /**
     * @notice Redeem the collateral from the protocol by providing the position token
     *
     * @param _positionTokenQty Quantity of the position token that the user is surrendering
     *
     * Amount of collateral is `_positionTokenQty` by the volatilityCapRatio.
     * Burn the position token
     *
     * Safely transfer the collateral to `msg.sender`
     */
    function redeem(uint256 _positionTokenQty)
        external
        onlyActive
        onlyNotSettled
    {
        uint256 collQtyToBeRedeemed = _positionTokenQty * volatilityCapRatio;

        _redeem(collQtyToBeRedeemed, _positionTokenQty, _positionTokenQty);
    }

    /**
     * @notice Redeem the collateral from the protocol after settlement
     *
     * @param _volatilityIndexTokenQty Quantity of the volatility index token that the user is surrendering
     * @param _inverseVolatilityIndexTokenQty Quantity of the inverse volatility index token that the user is surrendering
     *
     * Amount of collateral is `_volatilityIndexTokenQty` by the settlementPrice and `_inverseVolatilityIndexTokenQty`
     * by volatilityCapRatio - settlementPrice
     * Burn the position token
     *
     * Safely transfer the collateral to `msg.sender`
     */
    function redeemSettled(
        uint256 _volatilityIndexTokenQty,
        uint256 _inverseVolatilityIndexTokenQty
    ) external onlyActive onlySettled {
        uint256 collQtyToBeRedeemed =
            (_volatilityIndexTokenQty * settlementPrice) +
                (_inverseVolatilityIndexTokenQty *
                    (volatilityCapRatio - settlementPrice));

        _redeem(
            collQtyToBeRedeemed,
            _volatilityIndexTokenQty,
            _inverseVolatilityIndexTokenQty
        );
    }

    /**
     * @notice Settle the contract, preventing new minting and providing individual token redemption
     *
     * @param _settlementPrice The price of the volatility index after settlement
     *
     * The inverse volatility index token at settlement is worth volatilityCapRatio - volatility index settlement price
     */
    function settle(uint256 _settlementPrice)
        external
        onlyOwner
        onlyNotSettled
    {
        require(
            _settlementPrice <= volatilityCapRatio,
            "Volmex: _settlementPrice should be less than equal to volatilityCapRatio"
        );
        settlementPrice = _settlementPrice;
        isSettled = true;
        emit Settled(settlementPrice);
    }

    /**
     * @notice Recover tokens accidentally sent to this contract
     */
    function recoverTokens(
        address _token,
        address _toWhom,
        uint256 _howMuch
    ) external nonReentrant onlyOwner {
        require(
            _token != address(collateral),
            "Volmex: Collateral token not allowed"
        );
        IERC20Modified(_token).safeTransfer(_toWhom, _howMuch);
    }

    /**
     * @notice Update the percentage of `issuanceFees` and `redeemFees`
     *
     * @param _issuanceFees Percentage of fees required to collateralize the collateral
     * @param _redeemFees Percentage of fees required to redeem the collateral
     */
    function updateFees(uint256 _issuanceFees, uint256 _redeemFees)
        external
        onlyOwner
    {
        require(
            _issuanceFees <= MAX_FEE && _redeemFees <= MAX_FEE,
            "Volmex: issue/redeem fees should be less than MAX_FEE"
        );

        issuanceFees = _issuanceFees;
        redeemFees = _redeemFees;

        emit UpdatedFees(_issuanceFees, _redeemFees);
    }

    /**
     * @notice Safely transfer the accumulated fees to owner
     */
    function claimAccumulatedFees() external onlyOwner {
        uint256 claimedAccumulatedFees = accumulatedFees;
        delete accumulatedFees;

        collateral.safeTransfer(owner(), claimedAccumulatedFees);

        emit ClaimedFees(accumulatedFees);
    }

    /**
     * @notice Pause/unpause volmex position token.
     *
     * @param _isPause Boolean value to pause or unpause the position token { true = pause, false = unpause }
     */
    function togglePause(bool _isPause) external onlyOwner {
        if (_isPause) {
            volatilityToken.pause();
            inverseVolatilityToken.pause();
        } else {
            volatilityToken.unpause();
            inverseVolatilityToken.unpause();
        }

        emit ToggledVolatilityTokenPause(_isPause);
    }

    function _redeem(
        uint256 _collateralQtyRedeemed,
        uint256 _volatilityIndexTokenQty,
        uint256 _inverseVolatilityIndexTokenQty
    ) internal {
        uint256 fee;
        if (redeemFees > 0) {
            fee = (_collateralQtyRedeemed * redeemFees) / 10000;
            _collateralQtyRedeemed = _collateralQtyRedeemed - fee;
            accumulatedFees = accumulatedFees + fee;
        }

        volatilityToken.burn(msg.sender, _volatilityIndexTokenQty);
        inverseVolatilityToken.burn(
            msg.sender,
            _inverseVolatilityIndexTokenQty
        );

        collateral.safeTransfer(msg.sender, _collateralQtyRedeemed);

        emit Redeemed(
            msg.sender,
            _collateralQtyRedeemed,
            _volatilityIndexTokenQty,
            _inverseVolatilityIndexTokenQty,
            fee
        );
    }
}
