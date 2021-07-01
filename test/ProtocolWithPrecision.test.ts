const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
import { Signer, Contract, ContractReceipt, Event } from "ethers";

import {
  TestCollateralToken,
  TestCollateralToken__factory,
  VolmexPositionToken__factory,
  VolmexProtocolWithPrecision,
  VolmexProtocolWithPrecision__factory,
  VolmexPositionToken,
  VolmexIndexFactory__factory,
} from "../types";
import { Result } from "@ethersproject/abi";

const { expectRevert } = require("@openzeppelin/test-helpers");

const filterEvents = (
  blockEvents: ContractReceipt,
  name: String
): Array<Event> => {
  return blockEvents.events?.filter((event) => event.event === name) || [];
};

const decodeEvents = <T extends Contract>(
  token: T,
  events: Array<Event>
): Array<Result> => {
  const decodedEvents = [];
  for (const event of events) {
    const getEventInterface = token.interface.getEvent(event.event || "");
    decodedEvents.push(
      token.interface.decodeEventLog(
        getEventInterface,
        event.data,
        event.topics
      )
    );
  }
  return decodedEvents;
};

describe("Volmex Protocol With Precision", function () {
  let accounts: Signer[];
  let CollateralToken: TestCollateralToken;
  let CollateralTokenFactory: TestCollateralToken__factory;
  let VolmexPositionTokenFactory: VolmexPositionToken__factory;
  let VolmexPositionToken: VolmexPositionToken;
  let VolmexProtocolWithPrecisionFactory: VolmexProtocolWithPrecision__factory;
  let VolmexProtocolWithPrecision: VolmexProtocolWithPrecision;
  let indexFactory: VolmexIndexFactory__factory;
  let factory: Contract;
  let positionTokenCreatedEvent: Result[];

  this.beforeAll(async function () {
    accounts = await ethers.getSigners();
    // Deploy collateral token
    CollateralTokenFactory = (await ethers.getContractFactory(
      "TestCollateralToken"
    )) as TestCollateralToken__factory;

    VolmexPositionTokenFactory = (await ethers.getContractFactory(
      "VolmexPositionToken"
    )) as VolmexPositionToken__factory;

    VolmexProtocolWithPrecisionFactory = (await ethers.getContractFactory(
      "VolmexProtocolWithPrecision"
    )) as VolmexProtocolWithPrecision__factory;

    indexFactory = (await ethers.getContractFactory(
      "VolmexIndexFactory"
    )) as VolmexIndexFactory__factory;
  });

  this.beforeEach(async function () {
    CollateralToken =
      (await CollateralTokenFactory.deploy()) as TestCollateralToken;
    await CollateralToken.deployed();

    VolmexPositionToken =
      (await VolmexPositionTokenFactory.deploy()) as VolmexPositionToken;

    factory = await upgrades.deployProxy(indexFactory, [
      VolmexPositionToken.address,
    ]);
    await factory.deployed();

    const clonedPositionTokens = await factory.createVolatilityTokens(
      "Ethereum Volatility Index Token",
      "ETHV"
    );

    const transaction = await clonedPositionTokens.wait();

    positionTokenCreatedEvent = decodeEvents(
      factory,
      filterEvents(transaction, "VolatilityTokenCreated")
    );

    VolmexProtocolWithPrecision = await upgrades.deployProxy(
      VolmexProtocolWithPrecisionFactory,
      [
        CollateralToken.address,
        positionTokenCreatedEvent[0].volatilityToken,
        positionTokenCreatedEvent[0].inverseVolatilityToken,
        "25000000",
        "250",
        `${process.env.PRECISION_RATIO}`,
      ],
      {
        initializer: "initializePrecision",
      }
    );

    await VolmexProtocolWithPrecision.deployed();

    const receipt = await VolmexProtocolWithPrecision.updateFees(10, 30);
    await receipt.wait();

    const volmexProtocolRegister = await factory.registerIndex(
      VolmexProtocolWithPrecision.address,
      `${process.env.COLLATERAL_TOKEN_SYMBOL}`
    );

    await volmexProtocolRegister.wait();
  });

  it("Should deploy the protocol", async () => {
    const receipt = await VolmexProtocolWithPrecision.deployed();
    expect(receipt.confirmations).not.equal(0);
  });

  it("Should set the precision ratio", async () => {
    const precisionRatio = await VolmexProtocolWithPrecision.precisionRatio();

    expect(precisionRatio).equal(process.env.PRECISION_RATIO);
  });

  it("Should collateralize with correct precision", async () => {
    await CollateralToken.connect(accounts[0]).approve(
      VolmexProtocolWithPrecision.address,
      "250000000"
    );
    // @ts-ignore
    const receipt = await VolmexProtocolWithPrecision.connect(
      accounts[0]
    ).collateralize("250000000");

    expect((await receipt.wait()).confirmations).not.equal(0);
  });

  it("Should redeem the collateralized amount", async () => {
    await CollateralToken.connect(accounts[0]).approve(
      VolmexProtocolWithPrecision.address,
      "2500000000"
    );
    // @ts-ignore
    let receipt = await VolmexProtocolWithPrecision.connect(
      accounts[0]
    ).collateralize("2500000000");
    await receipt.wait();

    receipt = await VolmexProtocolWithPrecision.connect(accounts[0]).redeem(
      "1000000000000000000"
    );

    const redeemEvent = decodeEvents(
      VolmexProtocolWithPrecision,
      filterEvents(await receipt.wait(), "Redeemed")
    );

    expect(redeemEvent[0].collateralReleased).equal("249250000");

    await expectRevert(
      VolmexProtocolWithPrecision.connect(accounts[0]).redeem("1000000"),
      "Volmex: Collateral qty is less"
    );
  });

  it("Should not collateralize amount less than minimum collateral qty", async () => {
    await CollateralToken.connect(accounts[0]).approve(
      VolmexProtocolWithPrecision.address,
      "250000000"
    );

    await expectRevert(
      VolmexProtocolWithPrecision.connect(accounts[0]).collateralize("250000"),
      "Volmex: CollateralQty > minimum qty required"
    );
  });
});
