// SPDX-License-Identifier: BUSL-1.1

pragma solidity =0.8.2;

import "../tokens/VolmexPositionToken.sol";

// mock class using ERC20
contract VolmexPositionTokenMock is VolmexPositionToken {
    constructor(
        string memory name,
        string memory symbol,
        address initialAccount,
        uint256 initialBalance
    ) payable {
        initialize(name, symbol);
        _mint(initialAccount, initialBalance);
    }

    function transferInternal(
        address from,
        address to,
        uint256 value
    ) public {
        _transfer(from, to, value);
    }

    function approveInternal(
        address owner,
        address spender,
        uint256 value
    ) public {
        _approve(owner, spender, value);
    }
}
