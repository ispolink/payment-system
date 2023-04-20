const {task} = require("hardhat/config");


/**
 *
 * The name of the EIP712 domain.
 *
 */
const name = "Ispolink Payment Contract";
/**
 *
 * The version of the EIP712 domain.
 *
 */
const version = "1.0.0"

/**
 *
 * Deploys a PaymentContract.
 *
 * @name payment-contract-deploy
 * @param {string} tokenAddress - The token address used for payments.
 * @param {string} signerAddress - The address of the validation signer.
 * @throws Will throw an error if contract deployment fails.
 *
 */
task("payment-contract-deploy", "Deploy payment contract")
    .addPositionalParam("tokenAddress", "The token address used for payments")
    .addPositionalParam("signerAddress", "The address of validation signer")
    .setAction(async (taskArgs, hre) => {
        const contractFactory = await hre.ethers.getContractFactory("PaymentContract");
        const paymentContract = await contractFactory.deploy(taskArgs.tokenAddress, name, version, taskArgs.signerAddress);
        await paymentContract.deployed();
        const paymentContractAddress = paymentContract.address;
        console.log(paymentContractAddress);
    });
