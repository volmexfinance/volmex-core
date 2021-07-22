// SPDX-License-Identifier: BUSL-1.1

pragma solidity =0.8.4;

import "./VolmexProtocol.sol";
import "../library/VolmexSafeERC20.sol";

/**
 * @title Protocol Contract with Precision
 * @author volmex.finance [security@volmexlabs.com]
 *
 * This protocol is used for decimal values less than 18.
 */
contract VolmexProtocolWithPrecision is VolmexProtocol {
    using VolmexSafeERC20 for IERC20Modified;

    // This is the ratio of standard ERC20 tokens decimals by custom token decimals
    // Calculation for USDC: 10^18 / 10^6 = 10^12
    // Where 10^18 represent precision of volatility token decimals and 10^6 represent USDC (collateral) decimals
    uint256 public precisionRatio;

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
     * @param _ratio Ratio of standard ERC20 token decimals (18) by custom token
     */
    function initializePrecision(
        IERC20Modified _collateralTokenAddress,
        IERC20Modified _volatilityToken,
        IERC20Modified _inverseVolatilityToken,
        uint256 _minimumCollateralQty,
        uint256 _volatilityCapRatio,
        uint256 _ratio
    ) external initializer {
        initialize(
            _collateralTokenAddress,
            _volatilityToken,
            _inverseVolatilityToken,
            _minimumCollateralQty,
            _volatilityCapRatio
        );

        precisionRatio = _ratio;
    }

    /**
     * @notice Add collateral to the protocol and mint the position tokens
     * @param _collateralQty Quantity of the collateral being deposited
     *
     * @dev Added precision ratio to calculate the effective collateral qty
     *
     * NOTE: Collateral quantity should be at least required minimum collateral quantity
     *
     * Calculation: Get the quantity for position token
     * Mint the position token for `msg.sender`
     *
     */
    function collateralize(uint256 _collateralQty)
        external
        virtual
        override
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

        uint256 effectiveCollateralQty = _collateralQty * precisionRatio;

        uint256 qtyToBeMinted = effectiveCollateralQty / volatilityCapRatio;

        volatilityToken.mint(msg.sender, qtyToBeMinted);
        inverseVolatilityToken.mint(msg.sender, qtyToBeMinted);

        emit Collateralized(msg.sender, _collateralQty, qtyToBeMinted, fee);
    }

    function _redeem(
        uint256 _collateralQtyRedeemed,
        uint256 _volatilityIndexTokenQty,
        uint256 _inverseVolatilityIndexTokenQty
    ) internal virtual override {
        require(
            _collateralQtyRedeemed > precisionRatio,
            "Volmex: Collateral qty is less"
        );

        uint256 effectiveCollateralQty = _collateralQtyRedeemed /
            precisionRatio;

        uint256 fee;
        if (redeemFees > 0) {
            fee =
                (_collateralQtyRedeemed * redeemFees) /
                (precisionRatio * 10000);
            effectiveCollateralQty = effectiveCollateralQty - fee;
            accumulatedFees = accumulatedFees + fee;
        }

        volatilityToken.burn(msg.sender, _volatilityIndexTokenQty);
        inverseVolatilityToken.burn(
            msg.sender,
            _inverseVolatilityIndexTokenQty
        );

        collateral.safeTransfer(msg.sender, effectiveCollateralQty);

        emit Redeemed(
            msg.sender,
            effectiveCollateralQty,
            _volatilityIndexTokenQty,
            _inverseVolatilityIndexTokenQty,
            fee
        );
    }
}
