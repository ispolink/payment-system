// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.9;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/draft-EIP712.sol";

/**
 * @title PaymentVerifier
 * @dev The contract that verifies payment signatures.
 */
contract PaymentVerifier is EIP712, Ownable {
    bytes32 private constant _TYPEHASH = keccak256("Payment(address recipient,string subscriptionId,uint256 amount,uint64 deadline)");
    address private _signer;

    /**
     * @dev Constructs a new PaymentVerifier instance with the given name, version, and _signer. Inherits from the EIP712 and Ownable contracts.
     * @param name The name of the EIP712 domain.
     * @param version The version of the EIP712 domain.
     * @param signer The address of a sign verifier.
     */
    constructor(string memory name, string memory version, address signer) EIP712(name, version) {
        _signer = signer;
    }

    /**
     * @dev Verifies that the given signature is valid for the payment parameters: msg.sender, subscriptionId, amount, and deadline.
     * If the signature is not valid, the function will revert with an error message. If the signature is valid,
     * the function will return successfully. This function is marked as internal and view, so it can only be called
     * from within the contract and does not modify the state of the contract.
     * @param signature The signature of the payment transaction.
     * @param subscriptionId The identifier of the subscription being paid.
     * @param amount The amount of the payment in Wei.
     * @param deadline The timestamp after which the payment is considered expired.
     */
    function _verifyPaymentSignature(bytes memory signature, string memory subscriptionId, uint256 amount, uint256 deadline) internal view {
        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(
                _TYPEHASH,
                msg.sender,
                keccak256(bytes(subscriptionId)),
                amount,
                deadline
            )));

        address restoredSigner = ECDSA.recover(digest, signature);
        require(restoredSigner == _signer, "Invalid signature");
    }
}

pragma solidity 0.8.9;

/**
 * @title PaymentContract
 * @dev The contract that enables subscriptions using ERC20 tokens.
 */
contract PaymentContract is PaymentVerifier {
    using ECDSA for bytes32;

    // Declare a private variable to hold the token contract address
    IERC20 private _token;

    // Declare a private mapping to store subscription information
    mapping(string => Subscription) private _subscriptions;

    /**
     * @dev Declare a struct to store subscription information
     * @param buyer The address of the buyer who created the subscription.
     * @param timestamp The timestamp of when the subscription was created.
     * @param amount The amount of the subscription in Wei.
     * @param currency The address of the currency used for the subscription payment.
     */
    struct Subscription {
        address buyer;
        uint64 timestamp;
        uint192 amount;
        address currency;
    }

    /**
     * @dev Constructs a new PaymentContract instance with the given _token address.
     * Inherits from the PaymentVerifier contract.
     * @param token The address of the ERC20 token used for payments.
     * @param name The name of the EIP712 domain.
     * @param version The version of the EIP712 domain.
     * @param signer The address of a sign verifier.
     */
    constructor(address token, string memory name, string memory version, address signer) nonZeroAddress(signer) nonZeroAddress(token) PaymentVerifier(name, version, signer)  {
        // Initialize the token variable with the given token address
        _token = IERC20(token);
    }

    // Define a modifier to check that an address is not the zero address
    modifier nonZeroAddress(address account) {
        require(account != address(0), "zero address not allowed");
        _;
    }

    // Define an event to emit when a subscription is paid
    event SubscriptionPaid(address indexed buyer, uint192 amount, address currency, string indexed subscriptionId);
    // Define an event to emit when tokens are withdrawn from the contract
    event Withdraw(address indexed byOwner, address indexed toAddress, uint256 amount);
    // Define an event to emit when the token is changed
    event TokenChanged(address newToken);

    /**
     * @dev Withdraws all tokens from the contract and transfers them to the specified address.
     * Only the contract owner can call this function.
     * @param to The address to transfer the tokens to.
     * @return A boolean indicating whether the transfer was successful.
     */
    function withdrawAll(address to) public onlyOwner returns (bool){
        // Get the balance of tokens held by the contract
        uint256 withdrawAmount = _token.balanceOf(address(this));

        // Transfer the tokens to the specified address
        bool success = _token.transfer(to, withdrawAmount);
        require(success, "withdraw transfer failed");

        emit Withdraw(owner(), to, withdrawAmount);
        return success;
    }

    /**
     * @dev Changes the address of the ERC20 token used for payments.
     * Only the contract owner can call this function.
     * @param newToken The address of the new ERC20 token contract.
     */
    function setTokenAddress(address newToken) public onlyOwner nonZeroAddress(newToken) {
        // Set new currency token
        _token = IERC20(newToken);

        emit TokenChanged(newToken);
    }

    /**
     * @dev Creates a new subscription and stores the subscription information in the subscriptions mapping.
     * @param signature The signature of the payment transaction.
     * @param subscriptionId The identifier of the subscription being paid.
     * @param amount The amount of the subscription in Wei.
     * @param deadline The timestamp after which the payment is considered expired.
     */
    function createSubscription(bytes memory signature, string memory subscriptionId, uint192 amount, uint256 deadline) public {
        require(bytes(subscriptionId).length <= 13, "Subscription ID too long");
        require(bytes(subscriptionId).length >= 0, "Subscription ID too short");
        require(block.timestamp < deadline, "signed transaction expired");

        // Verify payment signature
        _verifyPaymentSignature(signature, subscriptionId, amount, deadline);

        // Check if subscription ID already exists
        require(_subscriptions[subscriptionId].buyer == address(0), "Subscription ID already exists");

        // Transfer tokens to this contract
        bool success = _token.transferFrom(msg.sender, address(this), amount);
        require(success, "Payments transfer failed!");

        // Add new subscription
        _subscriptions[subscriptionId] = Subscription({
        buyer : msg.sender,
        timestamp : uint64(block.timestamp),
        amount : amount,
        currency : address(_token)
        });

        emit SubscriptionPaid(msg.sender, amount, address(_token), subscriptionId);
    }

    /**
     * @dev Returns the subscription information for the specified subscription ID.
     * @param subscriptionId The identifier of the subscription to retrieve information for.
     * @return The subscription information: buyer address, timestamp, amount, and currency address.
     */
    function getSubscription(string calldata subscriptionId) public view returns (address, uint64, uint192, address){
        return (_subscriptions[subscriptionId].buyer, _subscriptions[subscriptionId].timestamp, _subscriptions[subscriptionId].amount, _subscriptions[subscriptionId].currency);
    }

    /**
     * @dev Returns the address of the ERC20 currency used for the subscription payment.
     */
    function getTokenAddress() public view returns (address){
        return address(_token);
    }
}