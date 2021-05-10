const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
import { Signer, Contract, ContractReceipt, Event } from "ethers";
import {
  VolmexIndexFactory,
  VolmexIndexFactory__factory,
  TestCollateralToken,
  TestCollateralToken__factory,
  VolmexProtocol,
  VolmexProtocol__factory,
  VolmexPositionToken__factory,
  VolmexPositionToken,
} from "../types";
import { Result } from "@ethersproject/abi";
const { expectRevert } = require("@openzeppelin/test-helpers");

export const filterEvents = (
  blockEvents: ContractReceipt,
  name: String
): Array<Event> => {
  return blockEvents.events?.filter((event) => event.event === name) || [];
};

export const decodeEvents = <T extends Contract>(
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

describe("Volmex Index Factory", function () {
  let accounts: Signer[];
  let CollateralToken: TestCollateralToken;
  let CollateralTokenFactory: TestCollateralToken__factory;
  let VolmexPositionTokenFactory: VolmexPositionToken__factory;
  let volmexProtocolFactory: VolmexProtocol__factory;
  let VolmexProtocol: VolmexProtocol;
  let VolmexPositionToken: VolmexPositionToken;
  let indexFactory: any;
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

    volmexProtocolFactory = (await ethers.getContractFactory(
      "VolmexProtocol"
    )) as VolmexProtocol__factory;

    indexFactory = (await ethers.getContractFactory(
      "VolmexIndexFactory"
    )) as VolmexIndexFactory__factory;
  });

  this.beforeEach(async function () {
    CollateralToken = (await CollateralTokenFactory.deploy()) as TestCollateralToken;
    await CollateralToken.deployed();

    VolmexPositionToken = (await VolmexPositionTokenFactory.deploy()) as VolmexPositionToken

    factory = await upgrades.deployProxy(indexFactory, [
      VolmexPositionToken.address
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

    VolmexProtocol = await upgrades.deployProxy(volmexProtocolFactory, [
      CollateralToken.address,
      positionTokenCreatedEvent[0].volatilityToken,
      positionTokenCreatedEvent[0].inverseVolatilityToken,
      "200000000000000000000",
      "200",
    ]);
    await VolmexProtocol.deployed();
  });

  it("Should deploy position token from factory", async () => {
    const volatilityToken = positionTokenCreatedEvent[0].volatilityToken;
    const inverseVolatilityToken =
      positionTokenCreatedEvent[0].inverseVolatilityToken;

    expect(volatilityToken).not.equal(null);
    expect(inverseVolatilityToken).not.equal(null);
  });

  it("should deploy index from a factory", async () => {
    const volmexProtocolRegister = await factory.registerIndex(
      positionTokenCreatedEvent[0].indexCount,
      VolmexProtocol.address
    );

    const indexRegisteredEvent = decodeEvents(
      factory,
      filterEvents(await volmexProtocolRegister.wait(), "IndexRegistered")
    );

    //@ts-ignore
    const address = indexRegisteredEvent[0].index;

    expect(address).not.equal(undefined);

    let instance: VolmexProtocol | null;
    const { interface: contract_interface } = (await ethers.getContractFactory(
      "VolmexProtocol"
    )) as VolmexProtocol__factory;

    instance = new ethers.Contract(address, contract_interface, accounts[0]);

    expect(instance).not.equal(null);

    expect(await instance?.active()).to.equal(true);

    await expectRevert(
      factory.registerIndex(
        positionTokenCreatedEvent[0].indexCount,
        VolmexProtocol.address
      ),
      "IndexFactory: Volatility tokens are not created yet"
    );
  });

  it("should determine position token address", async () => {
    const determineVolatilityToken = await factory.determineVolatilityTokenAddress(
      1,
      "Ethereum",
      "ETH"
    );

    expect(determineVolatilityToken).not.equal(null);
  });
});
