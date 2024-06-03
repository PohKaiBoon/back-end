const {
  Client,
  initLogger,
  utf8ToHex,
  Wallet,
  Utils,
  AddressUnlockCondition,
  Ed25519Address,
  PayloadType,
} = require("@iota/sdk");
const { checkHealth } = require("./utils/utils");
require("dotenv").config({ path: ".env" });
const fs = require("fs");
const path = require("path");

const client = new Client({
  nodes: [process.env.NODE_URL],
  localPow: true,
});

initLogger();

async function addTracebilityWithNewBatchID(tag, data) {
  try {
    for (const envVar of [
      "WALLET_DB_PATH",
      "STRONGHOLD_PASSWORD",
      "EXPLORER_URL",
    ]) {
      if (!(envVar in process.env)) {
        throw new Error(`.env ${envVar} is undefined, see .env.example`);
      }
    }

    let options = null;

    if (tag || data) {
      options = {
        tag: utf8ToHex(tag),
        data: utf8ToHex(data),
        type: PayloadType.TaggedData,
      };
    }

    const wallet = new Wallet({
      storagePath: process.env.WALLET_DB_PATH,
    });

    const account = await wallet.getAccount("coordinator");

    await account.sync();

    // To sign a transaction we need to unlock stronghold.
    await wallet.setStrongholdPassword(process.env.STRONGHOLD_PASSWORD);

    const address = (await account.generateEd25519Addresses(1))[0].address;
    console.log("New batch ID created: ", address)

    const transaction = await account.send(BigInt(1), address, {
      allowMicroAmount: true,
      taggedDataPayload: options ?? null,
    });

    console.log(`Transaction sent: ${transaction.transactionId}`);

    const blockId = await account.retryTransactionUntilIncluded(
      transaction.transactionId
    );

    console.log(`Block sent: ${process.env.EXPLORER_URL}/block/${blockId}`);
  } catch (error) {
    console.error("Error: ", error);
  }
}

// addTracebilityWithNewBatchID("TEST", "TEST");

async function addTracebilityWithExistingBatchID(tag, data, existingAddress) {
  try {
    for (const envVar of [
      "WALLET_DB_PATH",
      "STRONGHOLD_PASSWORD",
      "EXPLORER_URL",
    ]) {
      if (!(envVar in process.env)) {
        throw new Error(`.env ${envVar} is undefined, see .env.example`);
      }
    }

    if (!existingAddress) {
      throw new Error("No address defined in function!");
    }

    let options = null;

    if (tag || data) {
      options = {
        tag: utf8ToHex(tag),
        data: utf8ToHex(data),
        type: PayloadType.TaggedData,
      };
    }

    const wallet = new Wallet({
      storagePath: process.env.WALLET_DB_PATH,
    });

    const account = await wallet.getAccount("coordinator");

    await account.sync();

    // To sign a transaction we need to unlock stronghold.
    await wallet.setStrongholdPassword(process.env.STRONGHOLD_PASSWORD);

    const transaction = await account.send(BigInt(1), existingAddress, {
      allowMicroAmount: true,
      taggedDataPayload: options ?? null,
    });

    console.log(`Transaction sent: ${transaction.transactionId}`);

    const blockId = await account.retryTransactionUntilIncluded(
      transaction.transactionId
    );

    console.log(`Block sent: ${process.env.EXPLORER_URL}/block/${blockId}`);
  } catch (error) {
    console.error("Error: ", error);
  }
}

// addTracebilityWithExistingBatchID("TEST", "TEST", 'snd1qpylcme9d5pfj39sf7hq8rvrcnrtzgft58ftygu5ywzl9tjsglqhct2yqpu');

async function loadTransactionsUnderWallet(walletName) {
  try {
    for (const envVar of [
      "WALLET_DB_PATH",
      "STRONGHOLD_PASSWORD",
      "EXPLORER_URL",
    ]) {
      if (!(envVar in process.env)) {
        throw new Error(`.env ${envVar} is undefined, see .env.example`);
      }
    }

    const wallet = new Wallet({
      storagePath: process.env.WALLET_DB_PATH,
    });

    const accounts = await wallet.getAccount('coordinator');
    await accounts.sync({ syncIncomingTransactions: true });

    const transactions = await accounts.transactions();
    console.log(transactions)

  } catch (error) {
    console.error("Error: ", error);
  }
}

loadTransactionsUnderWallet()
