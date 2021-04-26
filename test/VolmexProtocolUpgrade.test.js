const expectEvent = require("@openzeppelin/test-helpers/src/expectEvent");
const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

describe("VolmexProtocolUpgradeable", function () {
  it("Can conserve state between upgrades", async () => {
    const PositionTokenContract = await ethers.getContractFactory(
      "VolmexPositionToken"
    );
    const DummyERC20Contract = await ethers.getContractFactory("TestCollateralToken");

    const DummyERC20Instance = await DummyERC20Contract.deploy();
    await DummyERC20Instance.deployed();
    const ethVLongInstance = await PositionTokenContract.deploy();
    await ethVLongInstance.deployed();
    await ethVLongInstance.initialize("Ethereum Volatility Index Token", "ETHV");
    const ethVShortInstance = await PositionTokenContract.deploy();
    await ethVShortInstance.deployed();
    await ethVShortInstance.initialize("Inverse Ethereum Volatility Index Token", "iETHV");

    const VolmexProtocol = await ethers.getContractFactory("VolmexProtocol");
    const VolmexProtocolUpgrade = await ethers.getContractFactory(
      "VolmexProtocolUpgradeMock"
    );

    const instance = await upgrades.deployProxy(VolmexProtocol, [
      DummyERC20Instance.address,
      ethVLongInstance.address,
      ethVShortInstance.address,
      "20000000000000000000",
      "200",
    ]);

    const originalProxy = {
      minimumCollateralQty: await instance.minimumCollateralQty(),
      active: await instance.active(),
      collateral: await instance.collateral(),
      issuanceFees: await instance.issuanceFees(),
      redeemFees: await instance.redeemFees(),
      accumulatedFees: await instance.accumulatedFees(),
    };

    const upgraded = await upgrades.upgradeProxy(
      instance.address,
      VolmexProtocolUpgrade
    );

    expect(originalProxy.minimumCollateralQty).to.be.equal(
      await upgraded.minimumCollateralQty()
    );

    expect(originalProxy.active).to.be.equal(await upgraded.active());

    expect(originalProxy.collateral).to.be.equal(await upgraded.collateral());

    expect(originalProxy.issuanceFees).to.be.equal(
      await upgraded.issuanceFees()
    );

    expect(originalProxy.redeemFees).to.be.equal(await upgraded.redeemFees());

    expect(originalProxy.accumulatedFees).to.be.equal(
      await upgraded.accumulatedFees()
    );
  });

  it("should be able to access new state variable addition", async () => {
    const PositionTokenContract = await ethers.getContractFactory(
      "VolmexPositionToken"
    );
    const DummyERC20Contract = await ethers.getContractFactory("TestCollateralToken");

    const DummyERC20Instance = await DummyERC20Contract.deploy();
    await DummyERC20Instance.deployed();
    const ethVLongInstance = await PositionTokenContract.deploy();
    await ethVLongInstance.deployed();
    await ethVLongInstance.initialize("Ethereum Volatility Index Token", "ETHV");
    const ethVShortInstance = await PositionTokenContract.deploy();
    await ethVShortInstance.deployed();
    await ethVShortInstance.initialize("Inverse Ethereum Volatility Index Token", "iETHV");

    const VolmexProtocol = await ethers.getContractFactory("VolmexProtocol");
    const VolmexProtocolUpgrade = await ethers.getContractFactory(
      "VolmexProtocolUpgradeMock"
    );

    const instance = await upgrades.deployProxy(VolmexProtocol, [
      DummyERC20Instance.address,
      ethVLongInstance.address,
      ethVShortInstance.address,
      "20000000000000000000",
      "200",
    ]);

    const upgraded = await upgrades.upgradeProxy(
      instance.address,
      VolmexProtocolUpgrade
    );

    const devFees = await upgraded.devFees();
    expect(devFees).to.be.equal(0);
  });

  it("should be able to access new function addition", async () => {
    const PositionTokenContract = await ethers.getContractFactory(
      "VolmexPositionToken"
    );
    const DummyERC20Contract = await ethers.getContractFactory("TestCollateralToken");

    const DummyERC20Instance = await DummyERC20Contract.deploy();
    await DummyERC20Instance.deployed();
    const ethVLongInstance = await PositionTokenContract.deploy();
    await ethVLongInstance.deployed();
    await ethVLongInstance.initialize("Ethereum Volatility Index Token", "ETHV");
    const ethVShortInstance = await PositionTokenContract.deploy();
    await ethVShortInstance.deployed();
    await ethVShortInstance.initialize("Inverse Ethereum Volatility Index Token", "iETHV");

    const VolmexProtocol = await ethers.getContractFactory("VolmexProtocol");
    const VolmexProtocolUpgrade = await ethers.getContractFactory(
      "VolmexProtocolUpgradeMock"
    );

    const instance = await upgrades.deployProxy(VolmexProtocol, [
      DummyERC20Instance.address,
      ethVLongInstance.address,
      ethVShortInstance.address,
      "20000000000000000000",
      "200",
    ]);

    const upgraded = await upgrades.upgradeProxy(
      instance.address,
      VolmexProtocolUpgrade
    );

    const transferDevFees = await upgraded.transferDevFees(
      "0xeBac98733b0a25FcDd56Bd078FFCC2350B6ba403"
    );
    expect(transferDevFees.value).to.be.equal(0);
  });

  it("should be able to access function update", async () => {
    const PositionTokenContract = await ethers.getContractFactory(
      "VolmexPositionToken"
    );
    const DummyERC20Contract = await ethers.getContractFactory("TestCollateralToken");

    const DummyERC20Instance = await DummyERC20Contract.deploy();
    await DummyERC20Instance.deployed();
    const ethVLongInstance = await PositionTokenContract.deploy();
    await ethVLongInstance.deployed();
    await ethVLongInstance.initialize("Ethereum Volatility Index Token", "ETHV");
    const ethVShortInstance = await PositionTokenContract.deploy();
    await ethVShortInstance.deployed();
    await ethVShortInstance.initialize("Inverse Ethereum Volatility Index Token", "iETHV");

    const VolmexProtocol = await ethers.getContractFactory("VolmexProtocol");
    const VolmexProtocolUpgrade = await ethers.getContractFactory(
      "VolmexProtocolUpgradeMock"
    );

    const instance = await upgrades.deployProxy(VolmexProtocol, [
      DummyERC20Instance.address,
      ethVLongInstance.address,
      ethVShortInstance.address,
      "20000000000000000000",
      "200",
    ]);

    const upgraded = await upgrades.upgradeProxy(
      instance.address,
      VolmexProtocolUpgrade
    );
    await upgraded.toggleActive(false);
    expect(await upgraded.active()).to.be.equal(false);
  });
});
