require("@nomicfoundation/hardhat-toolbox");
require("./scripts/token-deploy")
require("./scripts/payment-contract-deploy")

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.9",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  }
};
