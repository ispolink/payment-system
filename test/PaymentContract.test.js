const {ethers} = require("hardhat");
const {expect} = require("chai");


describe("PaymentContract", function () {
    let paymentContract, token, newToken, owner, user1, user2;

    const verifierName = "Ispolink Payment Contract";
    const verifierVersion = "1.0.0";
    const tokenTotalSupply = 100;

    beforeEach(async () => {
        [owner, user1, user2] = await ethers.getSigners();

        const tokenFactory = await ethers.getContractFactory("TokenMintERC20Token");
        token = await tokenFactory.deploy("Ispolink", "ISP", 18, tokenTotalSupply, owner.getAddress(), owner.getAddress());
        newToken = await tokenFactory.deploy("IspolinkV1", "ISP1", 18, tokenTotalSupply, owner.getAddress(), owner.getAddress());

        const paymentContractFactory = await ethers.getContractFactory("PaymentContract");
        paymentContract = await paymentContractFactory.deploy(token.address, verifierName, verifierVersion, owner.getAddress());

        token.connect(owner).transfer(user1.address, 25);
        token.connect(owner).transfer(user2.address, 25);

        newToken.connect(owner).transfer(user1.address, 25);
        newToken.connect(owner).transfer(user2.address, 25);
    });

    describe("check owner", () => {
        it("owner is the same who deployed the contract", async () => {
            const contractOwner = await paymentContract.owner();
            expect(contractOwner).to.equal(owner.address);
        });

        it("should change ownership", async () => {
            expect(await paymentContract.owner()).to.equal(owner.address);
            await paymentContract.connect(owner).transferOwnership(user1.address);
            expect(await paymentContract.owner()).to.equal(user1.address);
        });

        it("should not change ownership when not owner requesting", async () => {
            await expect(paymentContract.connect(user1).transferOwnership(user2.address)).to.be.revertedWith("Ownable: caller is not the owner");
            expect(await paymentContract.owner()).to.equal(owner.address);
        });
    });

    describe("createSubscription", () => {
        it("should create a valid subscription", async () => {
            const subscriptionId = "s83ksIn3c8";
            const amount = 10;
            const deadline = Math.floor(Date.now() / 1000) + 3600; // valid for 1 hour

            await token.connect(user1).increaseAllowance(paymentContract.address, 10)

            const signature = await generateSubscriptionSignature(owner, verifierName, verifierVersion, paymentContract, user1, subscriptionId, amount, deadline);
            await paymentContract.connect(user1).createSubscription(signature, subscriptionId, amount, deadline);

            const [buyer, , amountPaid, currency] = await paymentContract.getSubscription(subscriptionId);
            expect(buyer).to.equal(user1.address);
            expect(amount).to.equal(amountPaid);
            expect(currency).to.equal(token.address);
        });

        it("should fail when parameters not correct", async () => {
            const wrongAmount = 20;

            // requested subscription
            const subscriptionId = "s83ksIn3c8";
            const amount = 10;
            const deadline = Math.floor(Date.now() / 1000) + 3600; // valid for 1 hour

            await token.connect(user1).increaseAllowance(paymentContract.address, 20)

            const signature = await generateSubscriptionSignature(owner, verifierName, verifierVersion, paymentContract, user1, subscriptionId, amount, deadline);
            await expect(paymentContract.connect(user1).createSubscription(signature, subscriptionId, wrongAmount, deadline)).to.be.revertedWith("Invalid signature")
        });

        it("should fail when user don't allowed spend his tokens", async () => {
            const subscriptionId = "s83ksIn3c8";
            const amount = 10;
            const deadline = Math.floor(Date.now() / 1000) + 3600; // valid for 1 hour

            const signature = await generateSubscriptionSignature(owner, verifierName, verifierVersion, paymentContract, user1, subscriptionId, amount, deadline);
            await expect(paymentContract.connect(user1).createSubscription(signature, subscriptionId, amount, deadline)).to.be.revertedWith("SafeMath: subtraction overflow")
        });

        it("should fail when user allowed too small amount", async () => {
            const subscriptionId = "s83ksIn3c8";
            const amount = 10;
            const deadline = Math.floor(Date.now() / 1000) + 3600; // valid for 1 hour

            await token.connect(user1).increaseAllowance(paymentContract.address, 1)

            const signature = await generateSubscriptionSignature(owner, verifierName, verifierVersion, paymentContract, user1, subscriptionId, amount, deadline);
            await expect(paymentContract.connect(user1).createSubscription(signature, subscriptionId, amount, deadline)).to.be.revertedWith("SafeMath: subtraction overflow")
        });

        it("should fail when deadline expired", async function () {
            const subscriptionId = "s83ksIn3c8";
            const amount = 10;
            const deadline = Math.floor(Date.now() / 1000) - 3600; // expired before 1 hour

            await token.connect(user1).increaseAllowance(paymentContract.address, 10)

            const signature = await generateSubscriptionSignature(owner, verifierName, verifierVersion, paymentContract, user1, subscriptionId, amount, deadline);
            await expect(paymentContract.createSubscription(signature, subscriptionId, amount, deadline)).to.be.revertedWith("signed transaction expired");
        });

        it("should fail when subscription already exits", async function () {
            const subscriptionId = "s83ksIn3c9";
            const amount = 15;
            const deadline = Math.floor(Date.now() / 1000) + 3600; // valid for 1 hour

            await token.connect(user1).increaseAllowance(paymentContract.address, 15)
            await token.connect(user2).increaseAllowance(paymentContract.address, 15)

            const signature1 = await generateSubscriptionSignature(owner, verifierName, verifierVersion, paymentContract, user1, subscriptionId, amount, deadline);
            await paymentContract.connect(user1).createSubscription(signature1, subscriptionId, amount, deadline);

            const [buyer, , amountPaid, currency] = await paymentContract.getSubscription(subscriptionId);
            expect(buyer).to.equal(user1.address);
            expect(amount).to.equal(amountPaid);
            expect(currency).to.equal(token.address);

            const signature2 = await generateSubscriptionSignature(owner, verifierName, verifierVersion, paymentContract, user2, subscriptionId, amount, deadline);
            await expect(paymentContract.connect(user2).createSubscription(signature2, subscriptionId, amount, deadline)).to.be.revertedWith("Subscription ID already exists");
        });

        it("should fail when user2 uses signature from user1 and try to do a front-running attack", async function () {
            const subscriptionId = "s83ksIn3c9";
            const amount = 15;
            const deadline = Math.floor(Date.now() / 1000) + 3600; // valid for 1 hour

            const signature1 = await generateSubscriptionSignature(owner, verifierName, verifierVersion, paymentContract, user1, subscriptionId, amount, deadline);

            await token.connect(user1).increaseAllowance(paymentContract.address, 15)

            await expect(paymentContract.connect(user2).createSubscription(signature1, subscriptionId, amount, deadline)).to.be.revertedWith("Invalid signature");

            await paymentContract.connect(user1).createSubscription(signature1, subscriptionId, amount, deadline);

            const [buyer, , amountPaid, currency] = await paymentContract.getSubscription(subscriptionId);
            expect(buyer).to.equal(user1.address);
            expect(amount).to.equal(amountPaid);
            expect(currency).to.equal(token.address);
        });
    });


    describe("setTokenAddress", () => {
        it("should change token", async () => {
            expect(await paymentContract.getTokenAddress()).to.equal(token.address);
            await paymentContract.setTokenAddress(newToken.address);
            expect(await paymentContract.getTokenAddress()).to.equal(newToken.address);
        });

        it("should not change token when not owner requesting", async () => {
            expect(await paymentContract.getTokenAddress()).to.equal(token.address);
            await expect(paymentContract.connect(user1).setTokenAddress(newToken.address)).to.be.revertedWith("Ownable: caller is not the owner");
            expect(await paymentContract.getTokenAddress()).to.equal(token.address);
        });
    });


    describe("withdrawAll", () => {
        it("should withdraw all tokens from the contract", async () => {
            expect(parseInt(await token.balanceOf(owner.address))).to.equal(50);
            expect(parseInt(await token.balanceOf(user1.address))).to.equal(25);
            expect(parseInt(await token.balanceOf(user2.address))).to.equal(25);

            await token.connect(user1).transfer(paymentContract.address, 5);
            await token.connect(user2).transfer(paymentContract.address, 15);
            await expect(parseInt(await token.balanceOf(paymentContract.address))).to.equal(20);

            expect(parseInt(await token.balanceOf(user1.address))).to.equal(20);
            expect(parseInt(await token.balanceOf(user2.address))).to.equal(10);
            expect(parseInt(await token.balanceOf(paymentContract.address))).to.equal(20);

            await paymentContract.connect(owner).withdrawAll(user2.address);
            expect(parseInt(await token.balanceOf(user2.address))).to.equal(30);
            expect(parseInt(await token.balanceOf(paymentContract.address))).to.equal(0);
        });

        it("should not allow non-owner to withdraw all tokens from the contract", async () => {
            const initialBalance = await token.balanceOf(paymentContract.address);
            await expect(
                paymentContract.connect(user2).withdrawAll(user2.address)
            ).to.be.revertedWith("Ownable: caller is not the owner");
            const finalBalance = await token.balanceOf(paymentContract.address);
            expect(finalBalance).to.equal(initialBalance);
        });
    });
});

async function generateSubscriptionSignature(owner, verifierName, verifierVersion, paymentContract, user, subscriptionId, amount, deadline) {
    const chainId = await owner.getChainId();

    const message = {
        domain: {
            name: verifierName,
            version: verifierVersion,
            verifyingContract: paymentContract.address,
            chainId: chainId,
        },
        types: {
            Payment: [
                {name: "recipient", type: "address"},
                {name: "subscriptionId", type: "string"},
                {name: "amount", type: "uint256"},
                {name: "deadline", type: "uint64"},
            ],
        },
        data: {
            recipient: user.address,
            subscriptionId: subscriptionId,
            amount: amount,
            deadline: deadline,
        },
    };

    return await owner._signTypedData(message.domain, message.types, message.data);
}
