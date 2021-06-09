// SPDX-License-Identifier: BUSL-1.1

pragma solidity =0.8.4;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @dev ERC20 NonCollateral used for unit testing.
 */
contract NonCollateral is ERC20 {
    constructor(string memory name, string memory symbol) ERC20(name, symbol) {}
}
