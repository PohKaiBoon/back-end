// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

//creating smart contract
contract createTransaction {
    mapping(address => Transaction) public transactions;

    struct Transaction {
        string updatedDateTime;
        string orderId;
        address updatedBy;
    }

    function createNewTransaction(
        string memory _updatedDateTime,
        string memory orderId
    ) public {
        Transaction memory newTransaction = Transaction(
            _updatedDateTime,
            orderId,
            msg.sender
        );
        transactions[msg.sender] = newTransaction;
    }

    function getTransaction(
        address _senderAddress
    ) public view returns (string memory, string memory) {
        Transaction memory getting = transactions[_senderAddress];
        return (getting.orderId, getting.updatedDateTime);
    }
}
