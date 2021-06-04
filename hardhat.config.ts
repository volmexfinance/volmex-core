require("dotenv").config();
import "@nomiclabs/hardhat-truffle5";
import "@nomiclabs/hardhat-ethers";
import "@openzeppelin/hardhat-upgrades";
import "@openzeppelin/hardhat-defender";

import { task } from "hardhat/config";
import "@nomiclabs/hardhat-waffle";
import "hardhat-contract-sizer";
import "hardhat-typechain";
import "hardhat-deploy";
import "@nomiclabs/hardhat-etherscan";
import "hardhat-gas-reporter";
import "solidity-coverage";

// dotenv.config({ path: '.' + '/.env' });
const enableGasReport = !!process.env.ENABLE_GAS_REPORT;

// This is a sample Buidler task. To learn how to create your own go to
// https://buidler.dev/guides/create-task.html
task("accounts", "Prints the list of accounts", async (args, hre) => {
  const accounts = await hre.ethers.getSigners();

  for (const account of accounts) {
    console.log(await account.getAddress());
  }
});

export default {
  defender: {
    apiKey: process.env.DEFENDER_TEAM_API_KEY,
    apiSecret: process.env.DEFENDER_TEAM_API_SECRET_KEY,
  },
  contractSizer: {
    alphaSort: true,
    runOnCompile: true,
    disambiguatePaths: false,
  },
  optimizer: {
    enabled: true,
    runs: 200,
  },
  // defaultNetwork: "hardhat",
  networks: {
    hardhat: {
      allowUnlimitedContractSize: true,
      loggingEnabled: false,
    },
    localhost: {
      url: "http://127.0.0.1:8545", // same address and port for both Buidler and Ganache node
      gas: 8000000,
      gasLimit: 8000000,
      gasPrice: 1,
    },
    mainnet: {
      url: `https://eth-mainnet.alchemyapi.io/v2/${process.env.MAINNET_ALCHEMY_API_KEY}`,
      accounts: [`0x${process.env.PRIVATE_KEY}`],
      throwOnTransactionFailures: true,
      loggingEnabled: true,
      gas: 5000000,
      gasPrice: 20000000000, // 20 gwei, ref: https://etherscan.io/gastracker
      blockGasLimit: 8000000,
      timeout: 3600000
    },
    kovan: {
      url: `https://eth-kovan.alchemyapi.io/v2/${process.env.KOVAN_ALCHEMY_API_KEY}`,
      accounts: [`0x${process.env.PRIVATE_KEY}`],
      throwOnTransactionFailures: true,
      loggingEnabled: true,
    },
    goerli: {
      url: `https://eth-goerli.alchemyapi.io/v2/${process.env.GOERLI_ALCHEMY_API_KEY}`,
      accounts: [`0x${process.env.PRIVATE_KEY}`],
      throwOnTransactionFailures: true,
      loggingEnabled: true,
      gas: 5000000,
      gasPrice: 200000000000,
      blockGasLimit: 8000000,
      timeout: 10800000
    },
    rinkeby: {
      url: `https://eth-rinkeby.alchemyapi.io/v2/${process.env.RINKEBY_ALCHEMY_API_KEY}`,
      accounts: [`0x${process.env.PRIVATE_KEY}`],
      throwOnTransactionFailures: true,
      loggingEnabled: true,
      gasPrice: 10000000000
    }
  },
  namedAccounts: {
    deployer: 0,
  },
  paths: {
    sources: 'contracts',
  },
  etherscan: {
    // Your API key for Etherscan
    // Obtain one at https://etherscan.io/
    apiKey: process.env.ETHERSCAN_API_KEY,
  },
  solidity: {
    version: "0.8.2",
    settings: {
      optimizer: {
        enabled: true,
      },
    },
  },
  typechain: {
    outDir: "types",
    target: "ethers-v5",
  },
  gasReporter: {
    enable: enableGasReport,
    currency: "USD",
    outputFile: process.env.CI ? "gas-report.txt" : undefined,
  },
};
