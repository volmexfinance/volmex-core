// SPDX-License-Identifier: BUSL-1.1

pragma solidity =0.8.2;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @dev Modified Interface of the OpenZeppelin's IERC20 extra functions to add features in position token.
 */
interface IERC20Modified is IERC20 {
    function symbol() external view returns (string memory);

    function mint(address _toWhom, uint256 amount) external;

    function burn(address _whose, uint256 amount) external;

    function grantRole(bytes32 role, address account) external;

    function renounceRole(bytes32 role, address account) external;

    function pause() external;

    function unpause() external;
}
