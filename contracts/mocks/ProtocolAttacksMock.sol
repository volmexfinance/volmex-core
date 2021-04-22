// SPDX-License-Identifier: BUSL-1.1

pragma solidity =0.8.2;

import "../interfaces/IERC20Modified.sol";

interface IVolmexProtocol {
    function collateralize(uint256 collateralQty) external;

    function redeem(uint256 _positionTokenQty) external;
}

contract ProtocolAttacksMock {
    IVolmexProtocol protocolAddress;
    IERC20Modified collateral;

    constructor(IVolmexProtocol _protocolAddress, IERC20Modified _collateral) {
        collateral = _collateral;
        protocolAddress = _protocolAddress;
        collateral.approve(address(protocolAddress), 500000000000000000000);
    }

    function callCollaterizeAndRedeem() external {
        protocolAddress.collateralize(200000000000000000000);
        protocolAddress.redeem(1);
    }

    function callCollaterize() external {
        protocolAddress.collateralize(200000000000000000000);
    }
}
