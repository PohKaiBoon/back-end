const {
  Client,
  initLogger,
  utf8ToHex,
  Wallet,
  Utils,
  AddressUnlockCondition,
  Ed25519Address,
  PayloadType,
  SecretManager,
} = require("@iota/sdk");
const { checkHealth } = require("./utils/utils");
require("dotenv").config({ path: ".env" });
const fs = require("fs");
const path = require("path");
const traceability1 = require("./traceability1Farmer.json");

initLogger();

const client = new Client({
  nodes: [process.env.NODE_URL],
  localPow: true,
});

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
    const targetAddress = data?.batchId;

    if (tag || data) {
      options = {
        tag: utf8ToHex(tag),
        data: utf8ToHex(JSON.stringify(data)),
        type: PayloadType.TaggedData,
      };
    }

    const wallet = new Wallet({
      storagePath: process.env.WALLET_DB_PATH,
    });

    const account = await wallet.getAccount(process.env.WALLET_DB_PATH);

    await account.sync();

    // To sign a transaction we need to unlock stronghold.
    await wallet.setStrongholdPassword(process.env.STRONGHOLD_PASSWORD);

    const transaction = await account.send(BigInt(1), targetAddress, {
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

// addTracebilityWithNewBatchID("TEST", traceability1);

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

    const account = await wallet.getAccount(process.env.WALLET_DB_PATH);

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

    const accounts = await wallet.getAccount(process.env.WALLET_DB_PATH);
    await accounts.sync({ syncIncomingTransactions: true });

    const transactions = await accounts.transactions();
    console.log(transactions);
  } catch (error) {
    console.error("Error: ", error);
  }
}

// loadTransactionsUnderWallet();

async function generateBatchId() {
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

    const account = await wallet.getAccount(process.env.WALLET_DB_PATH);
    await wallet.setStrongholdPassword(process.env.STRONGHOLD_PASSWORD);

    const address = (await account.generateEd25519Addresses(1))[0].address;
    console.log("New batch ID created: ", address);

    const faucetResponse = await (
      await wallet.getClient()
    ).requestFundsFromFaucet(process.env.FAUCET_URL, address);

    console.log("Faucet Response: ", faucetResponse);

    balance = await account.getBalance();

    console.log("Balance", balance);

    return address;
  } catch (error) {
    console.error("Error: ", error);
  }
}

// generateBatchId();

async function getAllTraceabilityFromBatchId(address) {
  const outputIdsResponse = await client.basicOutputIds([
    {
      address: address,
    },
  ]);

  const outputs = await client.getOutputs(outputIdsResponse.items);
  console.log(outputs);
}

// getAllTraceabilityFromBatchId(
//   "snd1qpjpcsg2mdfc49pv78y8lf8vzzcjjsvfetumm6dwdrjp55g6h4vqw78yg97"
// );

// async function run() {
//   for (const envVar of ["NODE_URL", "MNEMONIC", "EXPLORER_URL"]) {
//     if (!(envVar in process.env)) {
//       throw new Error(`.env ${envVar} is undefined, see .env.example`);
//     }
//   }

//   try {
//     // Configure your own mnemonic in ".env". Since the output amount cannot be zero, the mnemonic must contain non-zero
//     // balance
//     const secretManager = {
//       mnemonic: process.env.MNEMONIC,
//     };

//     // We generate an address from our own mnemonic so that we send the funds to ourselves
//     const wallet = new Wallet({
//       storagePath: process.env.WALLET_DB_PATH,
//     });

//     const account = await wallet.getAccount(process.env.WALLET_DB_PATH);
//     await wallet.setStrongholdPassword(process.env.STRONGHOLD_PASSWORD);

//     const address = (await account.generateEd25519Addresses(1))[0].address;

//     console.log(address);

//     // We prepare the transaction
//     // Insert the output address and amount to spend. The amount cannot be zero.
//     const blockIdAndBlock = await client.buildAndPostBlock(secretManager, {
//       output: {
//         address: address,
//         amount: BigInt(1000000),
//       },
//     });

//     console.log(
//       `Block sent: ${process.env.EXPLORER_URL}/block/${blockIdAndBlock[0]}`
//     );
//   } catch (error) {
//     console.error("Error: ", error);
//   }
// }

// run().then(() => process.exit());
