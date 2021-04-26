const { expect } = require("chai");
const { ethers } = require("hardhat");
import {
  Signer,
  Contract,
  ContractReceipt,
  Event,
} from "ethers";
import {
  VolmexIndexFactory,
  VolmexIndexFactory__factory,
  TestCollateralToken,
  TestCollateralToken__factory,
  VolmexProtocol,
  VolmexProtocol__factory,
} from "../types";
import { Result } from "@ethersproject/abi";

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
      token.interface.decodeEventLog(getEventInterface, event.data, event.topics)
    );
  }
  return decodedEvents;
};

describe("Volmex Index Factory", function () {
  let accounts: Signer[];
  let CollateralToken: TestCollateralToken;
  let CollateralTokenFactory: TestCollateralToken__factory;
  let indexFactory: VolmexIndexFactory__factory;
  let factory: VolmexIndexFactory;

  this.beforeAll(async function () {
    accounts = await ethers.getSigners();
    // Deploy collateral token
    CollateralTokenFactory = (await ethers.getContractFactory(
      "TestCollateralToken"
    )) as TestCollateralToken__factory;

    indexFactory = (await ethers.getContractFactory(
      "VolmexIndexFactory"
    )) as VolmexIndexFactory__factory;
  });

  this.beforeEach(async function () {
    CollateralToken = (await CollateralTokenFactory.deploy()) as TestCollateralToken;
    await CollateralToken.deployed();

    factory = await indexFactory
      .deploy()
      .then((f: VolmexIndexFactory) => f.deployed());
  });

  it("should deploy index from a factory", async () => {
    const deployedIndex = await factory.createIndex(
      CollateralToken.address,
      "20000000000000000000",
      "200",
      "Ethereum",
      "ETH"
    );

    const transaction = await deployedIndex.wait();

    const indexCreatedEvent = decodeEvents(
      factory,
      filterEvents(transaction, "IndexCreated")
    );

    //@ts-ignore
    const address = indexCreatedEvent[0].index;

    expect(address).not.equal(undefined);

    let instance: VolmexProtocol | null;

    if (address !== undefined) {
      const {
        interface: contract_interface,
      } = (await ethers.getContractFactory(
        "VolmexProtocol"
      )) as VolmexProtocol__factory;
      instance = new ethers.Contract(address, contract_interface, accounts[0]);
      expect(await instance?.active()).to.equal(true);
    } else {
      instance = null;
    }
    expect(instance).not.equal(null);
  });

  it("Should deploy position token from factory", async () => {
    const deployedIndex = await factory.createIndex(
      CollateralToken.address,
      "20000000000000000000",
      "200",
      "Ethereum",
      "ETHV"
    );

    const transaction = await deployedIndex.wait();

    const positionTokenCreatedEvent = decodeEvents(
      factory,
      filterEvents(transaction, "PositionTokenCreated")
    );

    const volatilityToken = positionTokenCreatedEvent[0].volatilityToken;
    const inverseVolatilityToken = positionTokenCreatedEvent[0].inverseVolatilityToken;

    expect(volatilityToken).not.equal(null);
    expect(inverseVolatilityToken).not.equal(null);
  });

  it("should determine index address", async () => {
    const determineIndex = await factory.determineIndexAddress(1);

    expect(determineIndex).not.equal(null);
  });

  it("should determine position token address", async () => {
    const determinePositionToken = await factory.determinePositionTokenAddress(1, "Ethereum", "ETH");

    expect(determinePositionToken).not.equal(null);
  });
});
