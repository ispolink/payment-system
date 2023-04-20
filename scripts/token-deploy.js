/**
 * Deploys an ERC20 token.
 *
 * @param {string} name - The name of the token.
 * @param {string} symbol - The symbol of the token, recommended to be 3-4 chars.
 * @param {number} decimals - The number of decimal places of one token unit, commonly set to 18.
 * @param {number} totalSupply - Total supply of tokens in lowest units (depending on decimals).
 * @param {string=} recipientAddress - (Optional) The address that will receive some tokens on deploy.
 * @param {number=} amount - (Optional) The tokens amount recipient should receive.
 *
 * */
task("token-deploy", "Deploy ERC20 token")
    .addPositionalParam("name", "The name name of the token")
    .addPositionalParam("symbol", "The symbol of the token, 3-4 chars is recommended")
    .addPositionalParam("decimals", "The number of decimal places of one token unit, 18 is widely used")
    .addPositionalParam("totalSupply", "Total supply of tokens in lowest units (depending on decimals)")
    .addOptionalPositionalParam("recipientAddress", "The address that will receive some tokens on deploy")
    .addOptionalPositionalParam("amount", "The tokens amount recipient should receive")
    .setAction(async (taskArgs, hre) => {
        const [owner] = await hre.ethers.getSigners();
        const tokenFactory = await hre.ethers.getContractFactory("TokenMintERC20Token");
        const token = await tokenFactory.deploy(taskArgs.name, taskArgs.symbol, taskArgs.decimals, taskArgs.totalSupply, owner.address, owner.address);
        console.log(token.address)
        // optional (transfer tokens after deployment)
        if (taskArgs.recipientAddress && taskArgs.amount) {
            await token.connect(owner).transfer(taskArgs.recipientAddress, taskArgs.amount);
        }
    });
