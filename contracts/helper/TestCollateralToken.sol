// SPDX-License-Identifier: BUSL-1.1

pragma solidity =0.8.2;

import "@openzeppelin/contracts/token/ERC20/presets/ERC20PresetMinterPauser.sol";

contract TestCollateralToken is ERC20PresetMinterPauser {
    constructor() ERC20PresetMinterPauser("VolmexTestCollateralToken", "VUSD") {
        mint(msg.sender, 10000000000000000000000);
    }
}
