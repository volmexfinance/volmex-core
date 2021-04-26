const { expect, assert } = require("chai");
const { expectRevert } = require("@openzeppelin/test-helpers");
const { ethers, upgrades } = require("hardhat");

// custom function to check event and its args
const checkEvent = async (r: any, ...args: string[]) => {
  // args[0] will be the name of the event
  // rest of the args will be the parameters of the event
  const [eventName, ...eventParameters] = args;
  let eventNameCheck = true;
  let argsCheck = true;
  // check if the receipt has the event based on the eventName
  const event = (await r.wait()).events[0];
  const rEventName = event.event;
  if (eventName != rEventName) {
    eventNameCheck = false;
    return false;
  }
  // check if the event arguments contain the arguments provided for the test
  const rArgs = event.args;
  if (eventParameters.length != rArgs.length) {
    argsCheck = false;
    return false;
  }
  eventParameters.forEach((element) => {
    if (rArgs[element] == null || undefined) {
      argsCheck = false;
      return false;
    }
  });
  return true;
};

describe("Position Token contract", function () {
  //   /**
  //    * SCOPE OF THE TEST FOR THE POSITION TOKEN CONTRACT
  //    * 1. contract is successfully deployed: DONE
  //    * 2. deployed contract with the name and symbol as per the constructor: DONE
  //    * 3. deployed with no totalSupply: DONE
  //    * 4. only the owner of the contract is able to mint tokens: DONE
  //    * 5. only the owner of the contract is able to burn tokens: DONE
  //    * 6. only the owner of the contract is able to pause the contract: DONE
  //    * 7. once the contract is paused no token can be transferred: DONE
  //    * 8. once the contract is paused no token can be minted: DONE
  //    * 9. once the contract is paused no token can be burned: DONE
  //    */

  before(async function () {
    [this.owner, this.account2, this.account3] = await ethers.getSigners();
    this.PositionTokenContract = await ethers.getContractFactory(
      "VolmexPositionToken"
    );
    this.tokenName = "Ethereum Volatility Index Token";
    this.tokenSymbol = "ETHV";
  });

  // deploying a fresh PTContract before each test
  beforeEach(async function () {
    this.ptc = await this.PositionTokenContract.deploy();
    await this.ptc.deployed();
    await this.ptc.initialize(this.tokenName, this.tokenSymbol)
  });

  it("contract is successfully deployed", async function () {
    const address = this.ptc.address;
    expect(address).to.not.equal(null);
  });

  it("deployed contract with the name and symbol as per the constructor", async function () {
    const ptTokenName = await this.ptc.name();
    expect(ptTokenName).to.be.equal(this.tokenName);
  });

  it("deployed with no totalSupply", async function () {
    const ptTotalSupply = await this.ptc.totalSupply();
    expect(ptTotalSupply).to.be.equal(0);
  });

  it("only the owner of the contract is able to mint tokens", async function () {
    // minting tokens from non-owner account, expecting revert
    const value = await ethers.BigNumber.from("100");
    const toWhom = this.account2.address;
    await expectRevert(
      this.ptc.connect(this.account2).mint(toWhom, value),
      "VolmexPositionToken: must have volmex protocol role to mint"
    );
    // minting tokens from owner account, expecting success
    const receipt = await this.ptc.mint(toWhom, value);
    expect(await checkEvent(receipt, "Transfer", "from", "to", "value")).to.be
      .true;
    /// double confirming on the basis of the balance
    const account2Balance = await this.ptc.balanceOf(toWhom);
    const totalSupply = await this.ptc.totalSupply();
    expect(account2Balance).to.be.equal(value);
    expect(totalSupply).to.be.equal(value);
  });

  it("only the owner of the contract is able to burn tokens", async function () {
    // minting tokens to account2
    const value = await ethers.BigNumber.from("100");
    const toWhom = this.account2.address;
    const mintReceipt = await this.ptc.mint(toWhom, value);
    expect(await checkEvent(mintReceipt, "Transfer", "from", "to", "value")).to
      .be.true;
    // burning tokens from non-owner account, expecting revert
    await expectRevert(
      this.ptc.connect(this.account2).burn(toWhom, value),
      "VolmexPositionToken: must have volmex protocol role to burn"
    );
    // burning tokens from owner account, expecting success
    const burnReceipt = await this.ptc.burn(toWhom, value);
    expect(await checkEvent(burnReceipt, "Transfer", "from", "to", "value")).to
      .be.true;
  });

  it("only the owner of the contract is able to pause the contract", async function () {
    await expectRevert(
      this.ptc.connect(this.account2).pause(),
      "VolmexPositionToken: must have volmex protocol role to pause"
    );
    const receipt = await this.ptc.pause();
    expect(await checkEvent(receipt, "Paused", "account")).to.be.true;
  });

  it("once the contract is paused no token can be transferred", async function () {
    //mint token
    /// setting up variables
    const mintValue = await ethers.BigNumber.from("100");
    const transferValue = await ethers.BigNumber.from("50");
    const toWhom = this.account2.address;
    const transferee = this.account3.address;

    /// minting tokens
    const mintTeceipt = await this.ptc
      .connect(this.owner)
      .mint(toWhom, mintValue);
    expect(await checkEvent(mintTeceipt, "Transfer", "from", "to", "value")).to
      .be.true;

    //Transfer token to confirm that transfer fx is working fine
    const transferReceipt = await this.ptc
      .connect(this.account2)
      .transfer(transferee, transferValue);
    expect(await checkEvent(transferReceipt, "Transfer", "from", "to", "value"))
      .to.be.true;

    //pause contract
    const pauseReceipt = await this.ptc.pause();
    expect(await checkEvent(pauseReceipt, "Paused", "account")).to.be.true;

    //Transfer token to confirm it is failing
    await expectRevert(
      this.ptc.connect(this.account2).transfer(transferee, transferValue),
      "ERC20Pausable: token transfer while paused"
    );
  });

  it("once the contract is paused no token can be minted", async function () {
    //mint token
    /// setting up variables
    const mintValue = await ethers.BigNumber.from("100");
    const toWhom = this.account2.address;

    /// minting tokens
    const mintTeceipt = await this.ptc
      .connect(this.owner)
      .mint(toWhom, mintValue);
    expect(await checkEvent(mintTeceipt, "Transfer", "from", "to", "value")).to
      .be.true;

    //pause contract
    const pauseReceipt = await this.ptc.pause();
    expect(await checkEvent(pauseReceipt, "Paused", "account")).to.be.true;

    //minting again
    await expectRevert(
      this.ptc.mint(toWhom, mintValue),
      "ERC20Pausable: token transfer while paused"
    );
  });

  it("once the contract is paused no token can be burned", async function () {
    //mint token
    /// setting up variables
    const mintValue = await ethers.BigNumber.from("100");
    const toWhom = this.account2.address;

    /// minting tokens
    const mintTeceipt = await this.ptc.mint(toWhom, mintValue);
    expect(await checkEvent(mintTeceipt, "Transfer", "from", "to", "value")).to
      .be.true;

    //pause contract
    const pauseReceipt = await this.ptc.pause();
    expect(await checkEvent(pauseReceipt, "Paused", "account")).to.be.true;

    //burning tokens, expecting revert
    await expectRevert(
      this.ptc.burn(toWhom, mintValue),
      "ERC20Pausable: token transfer while paused"
    );
  });

  it("only the owner of the contract is able to unpause the contract", async function () {
    await expectRevert(
      this.ptc.connect(this.account2).unpause(),
      "VolmexPositionToken: must have volmex protocol role to unpause"
    );
    await this.ptc.pause();
    const receipt = await this.ptc.unpause();
    expect(await checkEvent(receipt, "Unpaused", "account")).to.be.true;
  });
});

describe("Protocol contract", function () {
  /**
   * SCOPE OF THE TEST FOR THE POSITION TOKEN CONTRACT
   * 1. contract is successfully deployed: DONE
   * 2. on deployment the contract is active: DONE
   * 3. on deployment the constructor arguments are successfully stored: DONE
   * 4. only the owner can toggle the contract's active status: DONE
   * 5. only the owner can change the minimum collateral qty: DONE
   * 6. only the owner can change the positionTokenContractAddress: DONE
   * 7. anyone can collateral to the protocol: DONE
   * 8. collateralize function can only be called when the contract is active: DONE
   * 9. for calling the collateral function the minimum collateral quantity is required: DONE
   * 10. only the acceptableCollateralCoin is used in the collateralize function: DONE
   * 11. on collateralization, msg.sender is issued both ETHV and iETHV tokens: DONE
   * 12. after collateralization, msg.sender is able to redeem the ETHV and iETHV and gets back collateral coin: DONE
   * 13. if issuanceFee > 0, fee is computed, reduced from the collateralQTY and only for the balance collateralQTY, the ETHVL and iETHV tokens are minted: DONE
   * 14. if issuanceFee > 0, accumulatedFee can be withdrawan through the claimAccumulatedFees fx: DONE
   * 15. if redeemFees > 0, fee is computed, reduced from the refundable collateralQTY and only the balance is returned back to the msg.sender: DONE
   * 16. if redeemFees > 0, accumulatedFee can be withdrawan through the claimAccumulatedFees fx: DONE
   * 17. checking the math of the number of ETHV and iETHV minted when "x" qty of collateralCoin is collateralized: DONE
   */

  before(async function () {
    [this.owner, this.account2, this.account3] = await ethers.getSigners();
    this.VolmexProtocolFactory = await ethers.getContractFactory(
      "VolmexProtocol"
    );
    this.PositionTokenContract = await ethers.getContractFactory(
      "VolmexPositionToken"
    );
    this.DummyERC20Contract = await ethers.getContractFactory("TestCollateralToken");
    this.token = await ethers.getContractFactory("NonCollateral");
    this.ethVLongName = "Ethereum Volatility Index Token";
    this.ethVLongSymbol = "ETHV";
    this.ethVShortName = "Inverse Ethereum Volatility Index Token";
    this.ethVShortSymbol = "iETHV";
  });

  // deploying a fresh PTContract before each test
  beforeEach(async function () {
    this.DummyERC20Instance = await this.DummyERC20Contract.deploy();
    await this.DummyERC20Instance.deployed();
    this.ethVLongInstance = await this.PositionTokenContract.deploy();
    await this.ethVLongInstance.deployed();
    await this.ethVLongInstance.initialize(this.ethVLongName, this.ethVLongSymbol);

    this.ethVShortInstance = await this.PositionTokenContract.deploy();
    await this.ethVShortInstance.deployed();
    this.ethVShortInstance.initialize(this.ethVShortName, this.ethVShortSymbol);

    this.protcolInstance = await upgrades.deployProxy(
      this.VolmexProtocolFactory,
      [
        this.DummyERC20Instance.address,
        this.ethVLongInstance.address,
        this.ethVShortInstance.address,
        "20000000000000000000",
        "200",
      ]
    );

    this.tokenInstance = await this.token.deploy("NonCollateral", "TKN");
    await this.tokenInstance.deployed();
    // granting the MINTER_ROLE to the protocol contract
    await this.ethVLongInstance.grantRole(
      ethers.utils.keccak256(ethers.utils.toUtf8Bytes("VOLMEX_PROTOCOL_ROLE")),
      this.protcolInstance.address
    );
    await this.ethVShortInstance.grantRole(
      ethers.utils.keccak256(ethers.utils.toUtf8Bytes("VOLMEX_PROTOCOL_ROLE")),
      this.protcolInstance.address
    );
  });

  it("all contracts are successfully deployed", async function () {
    expect(this.DummyERC20Instance.address).to.not.equal(null);
    expect(this.ethVLongInstance.address).to.not.equal(null);
    expect(this.ethVShortInstance.address).to.not.equal(null);
    expect(this.protcolInstance.address).to.not.equal(null);
  });

  it("on deployment the contract is active", async function () {
    const activeStatus = await this.protcolInstance.active();
    expect(activeStatus).to.be.true;
  });

  it("on deployment the constructor arguments are successfully stored", async function () {
    const collateralAddress = await this.protcolInstance.collateral();
    const volatilityTokenAddress = await this.protcolInstance.volatilityToken();
    const inverseVolatilityTokenAddress = await this.protcolInstance.inverseVolatilityToken();
    expect(collateralAddress).to.be.equal(this.DummyERC20Instance.address);
    expect(volatilityTokenAddress).to.be.equal(this.ethVLongInstance.address);
    expect(inverseVolatilityTokenAddress).to.be.equal(this.ethVShortInstance.address);
  });

  it("only the owner can toggle the contract's active status", async function () {
    await expectRevert(
      this.protcolInstance.connect(this.account2).toggleActive(),
      "Ownable: caller is not the owner"
    );
    const receipt = await this.protcolInstance.toggleActive();
    expect(await checkEvent(receipt, "ToggleActivated", "isActive")).to.be.true;
  });

  it("only the owner can change the minimum collateral qty", async function () {
    await expectRevert(
      this.protcolInstance
        .connect(this.account2)
        .updateMinimumCollQty("20000000000000000000"),
      "Ownable: caller is not the owner"
    );
    await expectRevert(
      this.protcolInstance.updateMinimumCollQty("0"),
      "Volmex: Minimum collateral quantity should be greater than 0"
    );
    const receipt = await this.protcolInstance.updateMinimumCollQty(
      "20000000000000000001"
    );
    expect(
      await checkEvent(
        receipt,
        "UpdatedMinimumCollateral",
        "newMinimumCollateralQty"
      )
    ).to.be.true;
  });

  it("only the owner can change the positionTokenContractAddress", async function () {
    let wallet = ethers.Wallet.createRandom();
    await expectRevert(
      this.protcolInstance
        .connect(this.account2)
        .updatePositionToken(wallet.address, true),
      "Ownable: caller is not the owner"
    );
    const receipt = await this.protcolInstance.updatePositionToken(
      wallet.address,
      true
    );
    expect(
      await checkEvent(
        receipt,
        "UpdatedPositionToken",
        "positionToken",
        "isLong"
      )
    ).to.be.true;
  });

  it("anyone can collateral to the protocol", async function () {
    // minting dummryERC20 token to account 2
    await this.DummyERC20Instance.mint(
      this.account2.address,
      "200000000000000000000"
    );
    // approving the protocol contract to use the dummry erc20 token held by account 2
    await this.DummyERC20Instance.connect(this.account2).approve(
      this.protcolInstance.address,
      "200000000000000000000"
    );
    // collaterilzing the position
    await this.protcolInstance
      .connect(this.account2)
      .collateralize("20000000000000000000");
    // expect(receipt.confirmations).to.be.above(0);
  });

  it("collateralize function can only be called when the contract is active", async function () {
    // minting dummryERC20 token to account 2
    await this.DummyERC20Instance.mint(
      this.account2.address,
      "200000000000000000000"
    );
    // approving the protocol contract to use the dummry erc20 token held by account 2
    await this.DummyERC20Instance.connect(this.account2).approve(
      this.protcolInstance.address,
      "200000000000000000000"
    );
    // toggling the active status of the contract
    await this.protcolInstance.toggleActive();
    // collaterilzing the position and expective revert
    await expectRevert(
      this.protcolInstance
        .connect(this.account2)
        .collateralize("20000000000000000000"),
      "Volmex: Protocol not active"
    );
  });

  it("for calling the collateral function the minimum collateral quantity is required", async function () {
    // minting dummryERC20 token to account 2
    await this.DummyERC20Instance.mint(
      this.account2.address,
      "200000000000000000000"
    );
    // approving the protocol contract to use the dummry erc20 token held by account 2
    await this.DummyERC20Instance.connect(this.account2).approve(
      this.protcolInstance.address,
      "200000000000000000000"
    );
    // collaterilzing the position with less than minimum qty and expeciting revert
    await expectRevert(
      this.protcolInstance
        .connect(this.account2)
        .collateralize("200000000000000"),
      "Volmex: CollateralQty < minimum qty required"
    );
  });

  it("only the acceptableCollateralCoin is used in the collateralize function", async function () {
    // deploying another version of the TestCollateralToken for this test
    this.DummyERC20InstanceV2 = await this.DummyERC20Contract.deploy();
    await this.DummyERC20InstanceV2.deployed();
    // minting dummryERC20 token to account 2
    await this.DummyERC20InstanceV2.mint(
      this.account2.address,
      "200000000000000000000"
    );
    // approving the protocol contract to use the dummry erc20 token held by account 2
    await this.DummyERC20InstanceV2.connect(this.account2).approve(
      this.protcolInstance.address,
      "200000000000000000000"
    );
    // collaterilzing the position with less than minimum qty and expeciting revert
    await expectRevert.unspecified(
      this.protcolInstance
        .connect(this.account2)
        .collateralize("200000000000000000000")
    );
  });

  it("on collateralization, msg.sender is issued both ETHV and iETHV tokens", async function () {
    //
    assert.equal(
      await this.ethVLongInstance.balanceOf(this.account2.address),
      0,
      "Account2 already holds some ETHV"
    );
    assert.equal(
      await this.ethVShortInstance.balanceOf(this.account2.address),
      0,
      "Account2 already holds some iETHV"
    );
    // minting dummryERC20 token to account 2
    await this.DummyERC20Instance.mint(
      this.account2.address,
      "200000000000000000000"
    );
    // approving the protocol contract to use the dummry erc20 token held by account 2
    await this.DummyERC20Instance.connect(this.account2).approve(
      this.protcolInstance.address,
      "200000000000000000000"
    );
    // collaterilzing the position
    const receipt = await this.protcolInstance
      .connect(this.account2)
      .collateralize("20000000000000000000");
    expect(receipt.confirmations).to.be.above(0);
    const ethvlBalance = await this.ethVLongInstance.balanceOf(
      this.account2.address
    );
    const ethvsBalance = await this.ethVShortInstance.balanceOf(
      this.account2.address
    );
    expect(ethvlBalance).to.be.above(0);
    expect(ethvsBalance).to.be.above(0);
  });

  it("after collateralization, msg.sender is able to redeem the ETHVL and iETHV and gets back collateral coin", async function () {
    assert.equal(
      await this.ethVLongInstance.balanceOf(this.account2.address),
      0,
      "Account2 already holds some ETHV"
    );
    assert.equal(
      await this.ethVShortInstance.balanceOf(this.account2.address),
      0,
      "Account2 already holds some iETHV"
    );
    // minting dummryERC20 token to account 2
    await this.DummyERC20Instance.mint(
      this.account2.address,
      "200000000000000000000"
    );
    // approving the protocol contract to use the dummry erc20 token held by account 2
    await this.DummyERC20Instance.connect(this.account2).approve(
      this.protcolInstance.address,
      "200000000000000000000"
    );
    // collaterilzing the position
    const receipt = await this.protcolInstance
      .connect(this.account2)
      .collateralize("20000000000000000000");
    expect(receipt.confirmations).to.be.above(0);
    const ethvlBalance = await this.ethVLongInstance.balanceOf(
      this.account2.address
    );
    const ethvsBalance = await this.ethVShortInstance.balanceOf(
      this.account2.address
    );
    expect(ethvlBalance).to.be.equal("100000000000000000");
    expect(ethvsBalance).to.be.equal("100000000000000000");
    // redeeming the ethvl and ethvs
    /// approving the protocol contract
    await this.ethVLongInstance
      .connect(this.account2)
      .approve(this.protcolInstance.address, ethvlBalance);
    await this.ethVShortInstance
      .connect(this.account2)
      .approve(this.protcolInstance.address, ethvsBalance);
    /// calling the redeem function
    const receipt2 = await this.protcolInstance
      .connect(this.account2)
      .redeem(ethvlBalance);
    expect(receipt2.confirmations).to.be.above(0);
  });

  it("if issuanceFee > 0, fee is computed, reduced from the collateralQTY and only for the balance collateralQTY, the ETHV and iETHV tokens are minted", async function () {
    //
    assert.equal(
      await this.ethVLongInstance.balanceOf(this.account2.address),
      0,
      "Account2 already holds some ETHV"
    );
    assert.equal(
      await this.ethVShortInstance.balanceOf(this.account2.address),
      0,
      "Account2 already holds some iETHV"
    );
    // minting dummryERC20 token to account 2
    await this.DummyERC20Instance.mint(
      this.account2.address,
      "400000000000000000000"
    );
    // approving the protocol contract to use the dummry erc20 token held by account 2
    await this.DummyERC20Instance.connect(this.account2).approve(
      this.protcolInstance.address,
      "400000000000000000000"
    );
    // updating the issuancefee
    await this.protcolInstance.updateFees(50, 0);
    // collaterilzing the position
    const receipt = await this.protcolInstance
      .connect(this.account2)
      .collateralize("400000000000000000000");
    expect(receipt.confirmations).to.be.above(0);
    const ethvlBalance = await this.ethVLongInstance.balanceOf(
      this.account2.address
    );
    const ethvsBalance = await this.ethVShortInstance.balanceOf(
      this.account2.address
    );
    expect(ethvlBalance.toString()).to.be.equal("1990000000000000000");
    expect(ethvsBalance.toString()).to.be.equal("1990000000000000000");
    await expectRevert(
      this.protcolInstance.updateFees(1000, 0),
      "Volmex: issue/redeem fees should be less than MAX_FEE"
    );
  });

  it("if issuanceFee > 0, accumulatedFee can be withdrawan through the claimAccumulatedFees fx", async function () {
    assert.equal(
      await this.ethVLongInstance.balanceOf(this.account2.address),
      0,
      "Account2 already holds some ETHV"
    );
    assert.equal(
      await this.ethVShortInstance.balanceOf(this.account2.address),
      0,
      "Account2 already holds some iETHV"
    );
    // minting dummryERC20 token to account 2
    await this.DummyERC20Instance.mint(
      this.account2.address,
      "400000000000000000000"
    );
    // approving the protocol contract to use the dummry erc20 token held by account 2
    await this.DummyERC20Instance.connect(this.account2).approve(
      this.protcolInstance.address,
      "400000000000000000000"
    );
    // updating the issuancefee
    await this.protcolInstance.updateFees(50, 0);
    // collaterilzing the position
    const receipt = await this.protcolInstance
      .connect(this.account2)
      .collateralize("400000000000000000000");
    expect(receipt.confirmations).to.be.above(0);
    const ethvlBalance = await this.ethVLongInstance.balanceOf(
      this.account2.address
    );
    const ethvsBalance = await this.ethVShortInstance.balanceOf(
      this.account2.address
    );
    expect(ethvlBalance.toString()).to.be.equal("1990000000000000000");
    expect(ethvsBalance.toString()).to.be.equal("1990000000000000000");
    const feeWithdrawalReceipt = await this.protcolInstance.claimAccumulatedFees();
    expect(feeWithdrawalReceipt.confirmations).to.be.above(0);
  });

  it("if redeemFees > 0, fee is computed, reduced from the refundable collateralQTY and only the balance is returned back to the msg.sender", async function () {
    assert.equal(
      await this.ethVLongInstance.balanceOf(this.account2.address),
      0,
      "Account2 already holds some ETHV"
    );
    assert.equal(
      await this.ethVShortInstance.balanceOf(this.account2.address),
      0,
      "Account2 already holds some iETHV"
    );
    assert.equal(
      await this.DummyERC20Instance.balanceOf(this.account2.address),
      0,
      "Account2 already holds some TestCollateralToken Tokens"
    );
    // minting dummryERC20 token to account 2
    await this.DummyERC20Instance.mint(
      this.account2.address,
      "200000000000000000000"
    );
    // approving the protocol contract to use the dummry erc20 token held by account 2
    await this.DummyERC20Instance.connect(this.account2).approve(
      this.protcolInstance.address,
      "200000000000000000000"
    );
    // collaterilzing the position
    const receipt = await this.protcolInstance
      .connect(this.account2)
      .collateralize("200000000000000000000");
    expect(receipt.confirmations).to.be.above(0);
    const ethvlBalance = await this.ethVLongInstance.balanceOf(
      this.account2.address
    );
    const ethvsBalance = await this.ethVShortInstance.balanceOf(
      this.account2.address
    );
    expect(ethvlBalance).to.be.equal("1000000000000000000");
    expect(ethvsBalance).to.be.equal("1000000000000000000");
    // redeeming the ethvl and ethvs
    /// approving the protocol contract
    await this.ethVLongInstance
      .connect(this.account2)
      .approve(this.protcolInstance.address, ethvlBalance);
    await this.ethVShortInstance
      .connect(this.account2)
      .approve(this.protcolInstance.address, ethvsBalance);
    // setting up the redemption fee
    await this.protcolInstance.updateFees(0, 50);
    /// calling the redeem function
    await this.protcolInstance.connect(this.account2).redeem(ethvlBalance);
    const newDummyERC20Balance = (
      await this.DummyERC20Instance.balanceOf(this.account2.address)
    ).toString();
    expect(newDummyERC20Balance).to.be.equal("199000000000000000000");
    await expectRevert(
      this.protcolInstance.updateFees(0, 1000),
      "Volmex: issue/redeem fees should be less than MAX_FEE"
    );
  });

  it("if redeemFees > 0, accumulatedFee can be withdrawan through the claimAccumulatedFees fx", async function () {
    const previousDummybalance = (
      await this.DummyERC20Instance.balanceOf(this.owner.address)
    ).toString();
    assert.equal(
      await this.ethVLongInstance.balanceOf(this.account2.address),
      0,
      "Account2 already holds some ethvl"
    );
    assert.equal(
      await this.ethVShortInstance.balanceOf(this.account2.address),
      0,
      "Account2 already holds some ethvs"
    );
    assert.equal(
      await this.DummyERC20Instance.balanceOf(this.account2.address),
      0,
      "Account2 already holds some TestCollateralToken Tokens"
    );
    // minting dummryERC20 token to account 2
    await this.DummyERC20Instance.mint(
      this.account2.address,
      "200000000000000000000"
    );
    // approving the protocol contract to use the dummry erc20 token held by account 2
    await this.DummyERC20Instance.connect(this.account2).approve(
      this.protcolInstance.address,
      "200000000000000000000"
    );
    // collaterilzing the position
    const receipt = await this.protcolInstance
      .connect(this.account2)
      .collateralize("200000000000000000000");
    expect(receipt.confirmations).to.be.above(0);
    const ethvlBalance = await this.ethVLongInstance.balanceOf(
      this.account2.address
    );
    const ethvsBalance = await this.ethVShortInstance.balanceOf(
      this.account2.address
    );
    expect(ethvlBalance).to.be.equal("1000000000000000000");
    expect(ethvsBalance).to.be.equal("1000000000000000000");
    // redeeming the ethvl and ethvs
    /// approving the protocol contract
    await this.ethVLongInstance
      .connect(this.account2)
      .approve(this.protcolInstance.address, ethvlBalance);
    await this.ethVShortInstance
      .connect(this.account2)
      .approve(this.protcolInstance.address, ethvsBalance);
    // setting up the redemption fee
    await this.protcolInstance.updateFees(0, 50);
    /// calling the redeem function
    await this.protcolInstance.connect(this.account2).redeem(ethvlBalance);
    const newDummyERC20Balance = (
      await this.DummyERC20Instance.balanceOf(this.account2.address)
    ).toString();
    expect(newDummyERC20Balance).to.be.equal("199000000000000000000");
    const feeWithdrawalReceipt = await this.protcolInstance.claimAccumulatedFees();
    expect(feeWithdrawalReceipt.confirmations).to.be.above(0);
    const newDummybalance = (
      await this.DummyERC20Instance.balanceOf(this.owner.address)
    ).toString();
    let diff = newDummybalance - previousDummybalance;
    expect(diff.toString()).to.be.equal("999999999999737900");
  });

  it('checking the math of the number of ETHVL and iETHV minted when "x" qty of collateralCoin is collateralized', async function () {
    const previousDummybalance = (
      await this.DummyERC20Instance.balanceOf(this.owner.address)
    ).toString();
    assert.equal(
      await this.ethVLongInstance.balanceOf(this.account2.address),
      0,
      "Account2 already holds some ethvl"
    );
    assert.equal(
      await this.ethVShortInstance.balanceOf(this.account2.address),
      0,
      "Account2 already holds some ethvs"
    );
    assert.equal(
      await this.DummyERC20Instance.balanceOf(this.account2.address),
      0,
      "Account2 already holds some TestCollateralToken Tokens"
    );
    // minting dummryERC20 token to account 2
    await this.DummyERC20Instance.mint(
      this.account2.address,
      "200000000000000000000"
    );
    // approving the protocol contract to use the dummry erc20 token held by account 2
    await this.DummyERC20Instance.connect(this.account2).approve(
      this.protcolInstance.address,
      "200000000000000000000"
    );
    // collaterilzing the position
    const receipt = await this.protcolInstance
      .connect(this.account2)
      .collateralize("200000000000000000000");
    expect(receipt.confirmations).to.be.above(0);
    const ethvlBalance = await this.ethVLongInstance.balanceOf(
      this.account2.address
    );
    const ethvsBalance = await this.ethVShortInstance.balanceOf(
      this.account2.address
    );
    expect(ethvlBalance).to.be.equal("1000000000000000000");
    expect(ethvsBalance).to.be.equal("1000000000000000000");
  });

  it("only the owner can toggle the position token pause", async function () {
    await expectRevert(
      this.protcolInstance.connect(this.account2).togglePause(true),
      "Ownable: caller is not the owner"
    );
    let receipt = await this.protcolInstance.togglePause(true);
    expect(await checkEvent(receipt, "ToggledPositionTokenPause", "isPause")).to
      .be.false;

    receipt = await this.protcolInstance.togglePause(false);
    expect(await checkEvent(receipt, "ToggledPositionTokenPause", "isPause")).to
      .be.false;
  });

  it("only the owner can transfer the recovery tokens", async function () {
    let wallet = ethers.Wallet.createRandom();
    await expectRevert(
      this.protcolInstance
        .connect(this.owner)
        .recoverTokens(this.DummyERC20Instance.address, wallet.address, 0),
      "Volmex: Collateral token not allowed"
    );
    const receipt = await this.protcolInstance.recoverTokens(
      this.tokenInstance.address,
      wallet.address,
      0
    );
    expect(await this.tokenInstance.balanceOf(wallet.address)).to.equal(0);
  });

  it("on settle, revert if settlementPrice > volatilityCap", async function () {
    await expectRevert(
      this.protcolInstance.settle("210"),
      "Volmex: _settlementPrice should be less than equal to volatilityCap"
    );
  });

  it("On settle, call to collateralize and redeem should revert", async function () {
    await this.protcolInstance.settle("10");

    await expectRevert(
      this.protcolInstance
        .connect(this.account2)
        .collateralize("20000000000000000000"),
      "Volmex: Protocol settled"
    );

    await expectRevert(
      this.protcolInstance.connect(this.account2).redeem("100000000000000000"),
      "Volmex: Protocol settled"
    );
  });

  it("On settle, call to redeemSettled should be successful", async function () {
    await this.DummyERC20Instance.mint(
      this.account2.address,
      "200000000000000000000"
    );
    // approving the protocol contract to use the dummry erc20 token held by account 2
    await this.DummyERC20Instance.connect(this.account2).approve(
      this.protcolInstance.address,
      "200000000000000000000"
    );
    // collaterilzing the position
    await this.protcolInstance
      .connect(this.account2)
      .collateralize("200000000000000000000");

    await this.protcolInstance.connect(this.owner).settle("10");

    const receipt = await this.protcolInstance
      .connect(this.account2)
      .redeemSettled("1000000000000000000", "1000000000000000000");

    expect(receipt.confirmations).to.be.above(0);
  });

  it("protocol functions should not be called in same transaction", async function () {
    const protocolAttacksMock = await ethers.getContractFactory(
      "ProtocolAttacksMock"
    );
    const protocolAttacksInstance = await protocolAttacksMock.deploy(
      this.protcolInstance.address,
      this.DummyERC20Instance.address
    );
    await protocolAttacksInstance.deployed();

    this.DummyERC20Instance.transfer(
      protocolAttacksInstance.address,
      "500000000000000000000"
    );

    await this.protcolInstance.approveContractAccess(protocolAttacksInstance.address);

    const receipt = await protocolAttacksInstance.callCollaterize();
    expect(receipt.confirmations).to.be.above(0);

    expectRevert(
      protocolAttacksInstance.callCollaterizeAndRedeem(),
      "Volmex: Operations are locked for current block"
    );

    await this.protcolInstance.revokeContractAccess(protocolAttacksInstance.address);

    expectRevert(
      protocolAttacksInstance.callCollaterizeAndRedeem(),
      "Volmex: Access denied for caller"
    );
  });
});
