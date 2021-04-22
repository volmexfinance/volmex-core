// SPDX-License-Identifier: BUSL-1.1

pragma solidity =0.8.2;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

import "../interfaces/IERC20Modified.sol";
import "../library/VolmexSafeERC20.sol";

/**
 * @title Protocol Contract
 * @author Volmex [security@volmexlabs.com]
 */
contract VolmexProtocolUpgradeMock is
    Initializable,
    OwnableUpgradeable,
    ReentrancyGuardUpgradeable
{
    using VolmexSafeERC20 for IERC20Modified;

    event ToggleActivated(bool isActive);
    event UpdatedPositionToken(address indexed positionToken, bool isVolatilityIndexToken);
    event Collateralized(
        address indexed sender,
        uint256 collateralLock,
        uint256 positionTokensMinted,
        uint256 fees
    );
    event Redeemed(
        address indexed sender,
        uint256 collateralReleased,
        uint256 positionTokenBurned,
        uint256 fees
    );
    event UpdatedFees(
        uint256 issuanceFees,
        uint256 redeemFees,
        uint256 MAX_FEE
    );
    event UpdatedMinimumCollateral(uint256 newMinimumCollateralQty);
    event ClaimedFees(uint256 fees);
    event ToggledPositionTokenPause(bool isPause);
    event TransferDevFees(uint256 devFees);

    uint256 public minimumCollateralQty;
    bool public active;
    bool public isSettled;

    IERC20Modified public volatilityToken;
    IERC20Modified public inverseVolatilityToken;

    // Only ERC20 standard functions are used by the collateral defined here.
    // Address of the acceptable collateral token.
    IERC20Modified public collateral;

    uint256 public issuanceFees;
    uint256 public redeemFees;
    uint256 public accumulatedFees;

    // Percentage value is upto two decimal places, so we're dividing it by 10000
    // Set the max fee as 15%, i.e. 1500/10000.
    // TODO: @cole need confirmation for this
    uint256 constant MAX_FEE = 1500;

    // No need to add 18 decimals, because they are already considered in respective token qty arguments.
    uint256 public volatilityCapRatio;

    // This is the price of volatility index, ranges from 0 to volatilityCapRatio,
    // and the inverse can be calculated using volatilityCapRatio
    uint256 public settlementPrice;

    mapping(address => uint256) public blockLock;

    mapping(address => bool) public approved;
    uint256 public devFees;

    /**
     * @notice Used to check calling address is active
     */
    modifier onlyActive() {
        require(active, "Volmex: Protocol not active");
        _;
    }

    /**
     * @notice Used to secure our functions from flash loans attack.
     */
    modifier blockLocked() {
        require(
            blockLock[tx.origin] < block.number,
            "Volmex: Operations are locked for current block"
        );
        _;
    }

    /**
     * @notice Creates the {PositionTokens}.
     *
     * @dev Makes the protocol `active` at deployment
     * @dev Locks the `minimumCollateralQty` at 20*10^18 tokens
     * @dev Makes the collateral token as `collateral`
     *
     * @param _collateralTokenAddress is address of collateral token typecasted to IERC20Modified
     * @param _volatilityToken is address of volatility index token typecasted to IERC20Modified
     * @param _inverseVolatilityToken is address of inverse volatility index token typecasted to IERC20Modified
     */
    function initialize(
        IERC20Modified _collateralTokenAddress,
        IERC20Modified _volatilityToken,
        IERC20Modified _inverseVolatilityToken,
        uint256 _minimumCollateralQty
    ) public initializer {
        require(
            _minimumCollateralQty > 0,
            "Volmex: Minimum collateral quantity should be greater than 0"
        );

        active = true;
        minimumCollateralQty = _minimumCollateralQty;
        collateral = _collateralTokenAddress;
        volatilityToken = _volatilityToken;
        inverseVolatilityToken = _inverseVolatilityToken;
    }

    /**
     * @notice Toggles the active variable. Restricted to only the owner of the contract.
     */
    function toggleActive(bool _active) external onlyOwner {
        active = _active;
        emit ToggleActivated(_active);
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
     * @notice Update the {Position Token}
     * @param _positionToken Address of the new position token
     * @param _isVolatilityIndexToken Type of the postion token, { VolatilityIndexToken: true, InverseVolatilityIndexToken: false }
     */
    function updatePositionToken(address _positionToken, bool _isVolatilityIndexToken)
        external
        onlyOwner
    {
        _isVolatilityIndexToken
            ? volatilityToken = IERC20Modified(_positionToken)
            : inverseVolatilityToken = IERC20Modified(_positionToken);
        emit UpdatedPositionToken(_positionToken, _isVolatilityIndexToken);
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
        blockLocked
    {
        require(
            _collateralQty >= minimumCollateralQty,
            "Volmex: CollateralQty < minimum qty required"
        );

        uint256 fee;
        if (issuanceFees > 0) {
            fee = (_collateralQty * issuanceFees) / 10000;
            _collateralQty = _collateralQty - fee - 10;
            accumulatedFees = accumulatedFees + fee;
            devFees = devFees + 10;
        }

        uint256 qtyToBeMinted = _collateralQty / 200;

        collateral.safeTransferFrom(msg.sender, address(this), _collateralQty);

        volatilityToken.mint(msg.sender, qtyToBeMinted);
        inverseVolatilityToken.mint(msg.sender, qtyToBeMinted);

        emit Collateralized(msg.sender, _collateralQty, qtyToBeMinted, fee);

        _lockForBlock();
    }

    /**
     * @notice Redeem the collateral from the protocol by providing the position token
     *
     * @param _positionTokenQty Quantity of the position token that the user is surrendering
     *
     * Amount of collateral is `_positionTokenQty` by the constant 200.
     * Burn the position token
     *
     * Safely transfer the collateral to `msg.sender`
     */
    function redeem(uint256 _positionTokenQty) external onlyActive blockLocked {
        uint256 collQtyToBeRedeemed = _positionTokenQty * 200;

        uint256 fee;
        if (redeemFees > 0) {
            fee = (collQtyToBeRedeemed * redeemFees) / 10000;
            collQtyToBeRedeemed = collQtyToBeRedeemed - fee - 10;
            accumulatedFees = accumulatedFees + fee;
            devFees = devFees + 10;
        }

        collateral.safeTransfer(msg.sender, collQtyToBeRedeemed);

        volatilityToken.burn(msg.sender, _positionTokenQty);
        inverseVolatilityToken.burn(msg.sender, _positionTokenQty);

        emit Redeemed(msg.sender, collQtyToBeRedeemed, _positionTokenQty, fee);

        _lockForBlock();
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
     * @param _redeemFees Percentage of fees reuired to redeem the collateral
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

        emit UpdatedFees(_issuanceFees, _redeemFees, MAX_FEE);
    }

    /**
     * @notice Safely transfer the accumulated fees to owner
     */
    function claimAccumulatedFees() external onlyOwner {
        collateral.safeTransfer(owner(), accumulatedFees);
        delete accumulatedFees;

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

        emit ToggledPositionTokenPause(_isPause);
    }

    function _lockForBlock() internal {
        blockLock[tx.origin] = block.number;
    }

    /**
     * @notice Safely transfer dev fees to developer wallet address
     *
     * @param devWalletAddress Wallet address of developer on which the devFees will be transfered
     */
    function transferDevFees(address devWalletAddress) external onlyOwner {
        collateral.safeTransfer(devWalletAddress, devFees);
        delete devFees;

        emit TransferDevFees(devFees);
    }
}
