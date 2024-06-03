const {
  Client,
  initLogger,
  utf8ToHex,
  hexToUtf8,
  TaggedDataPayload,
  Wallet,
  CoinType,
  PayloadType,
  Utils,
  AddressUnlockCondition,
  TimelockUnlockCondition,
  Ed25519Address,
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
// preChecks(client);

async function preChecks(client) {
  await checkHealth(client);
  await checkIfWalletExists();
}

async function checkIfWalletExists() {
  if (!"WALLET_DB_PATH" in process.env) return false;

  const directoryPath = path.join(__dirname, process.env.WALLET_DB_PATH);

  // Check if the directory exists
  if (fs.existsSync(directoryPath)) {
    console.log("Wallet found, not creating new wallet");
  } else {
    console.log(
      "Directory does not exist, creating wallet based on ENV file wallet name"
    );
  }
}

async function createWallet(alias) {
  for (const envVar of [
    "NODE_URL",
    "STRONGHOLD_PASSWORD",
    "STRONGHOLD_SNAPSHOT_PATH",
    "MNEMONIC",
    "WALLET_DB_PATH",
  ])
    if (!(envVar in process.env)) {
      throw new Error(`.env ${envVar} is undefined, see .env.example`);
    }

  try {
    const walletOptions = {
      storagePath: process.env.WALLET_DB_PATH,
      clientOptions: {
        nodes: [process.env.NODE_URL],
      },
      coinType: CoinType.Shimmer,
      secretManager: {
        stronghold: {
          snapshotPath: process.env.STRONGHOLD_SNAPSHOT_PATH,
          password: process.env.STRONGHOLD_PASSWORD,
        },
      },
    };

    const wallet = new Wallet(walletOptions);

    // A mnemonic can be generated with `Utils.generateMnemonic()`.
    // Store the mnemonic in the Stronghold snapshot, this needs to be done only the first time.
    // The mnemonic can't be retrieved from the Stronghold file, so make a backup in a secure place!
    await wallet.storeMnemonic(process.env.MNEMONIC);

    // Create a new account
    const account = await wallet.createAccount({
      alias: alias,
    });
    console.log("Generated new account:", account.getMetadata().alias);
  } catch (error) {
    console.error("Error: ", error);
  }
}

// createWallet("coordinator")

// This example sends a micro transaction
async function sendMicroTransaction(alias) {
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

    const account = await wallet.getAccount(alias);

    await account.sync();

    // To sign a transaction we need to unlock stronghold.
    await wallet.setStrongholdPassword(process.env.STRONGHOLD_PASSWORD);
    // Replace with the address of your choice!
    const address = (await account.generateEd25519Addresses(1))[0].address;
    console.log("Address to be sent", address);
    const balance = await account.getBalance();
    console.log("Balance", balance);

    const options = {
      tag: utf8ToHex("Hello"),
      data: utf8ToHex("Test"),
      type: PayloadType.TaggedData,
    };

    client.buildAndPostBlock();
    const transaction = await account.send(BigInt(1), address, {
      allowMicroAmount: true,
      taggedDataPayload: options,
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

// sendMicroTransaction("coordinator").then(() => process.exit());

async function viewAllTransactions(alias) {
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

    const account = await wallet.getAccount(alias);

    // await account.sync();

    const transactions = await account.transactions();
    console.log("Sent transactions:");
    for (const transaction of transactions)
      console.log(transaction.transactionId);
    const balance = await account.getBalance();
    console.log("Balance", balance);
  } catch (error) {
    console.error("Error: ", error);
  }
}

// viewAllTransactions("bob").then(() => process.exit());

async function viewBlockDetails(alias) {
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

    // const wallet = new Wallet({
    //   storagePath: process.env.WALLET_DB_PATH,
    // });

    // const account = await wallet.getAccount(alias);

    // await account.sync();
    // console.log(await account.sync());

    const fetchedBlock = await client.getBlock(
      "0xd52b343304b21ec6d6bd817170e9d02f4b5bdc4d584e6fa30dfdb1d2f92511dc"
    );
    const payload = fetchedBlock.payload;
    console.log(payload.essence.payload);
    console.log("Decoded data:", hexToUtf8(payload.essence.payload.data));
  } catch (error) {
    console.error("Error: ", error);
  }
}

// viewBlockDetails("bob").then(() => process.exit());

async function addTracebility() {
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

    const account = await wallet.getAccount("coordinator");

    await account.sync();

    // To sign a transaction we need to unlock stronghold.
    await wallet.setStrongholdPassword(process.env.STRONGHOLD_PASSWORD);

    const address = await account.generateEd25519Addresses(1);
    console.log(address[0].address);

    // const test = new Ed25519Address(address);
    // console.log(test);

    // const addressUnlockCondition = new AddressUnlockCondition(test);
    // console.log(addressUnlockCondition);

    // Create an output with amount 1_000_000 and a timelock of 1 hour
    // account.sendOutputs({})

    const outputs = {
      amount: BigInt(224500),
      unlockConditions: [
        new AddressUnlockCondition(
          new Ed25519Address(
            Utils.bech32ToHex(
              "snd1qzzlrmeerthts5xsphva8qtfjex7j44nl0qn6c9dx2f4xcpxxx43cuxef3q"
            )
          )
        ),
      ],
      features: [
        {
          type: 3,
          tag: utf8ToHex("Test"),
        },
        {
          type: 2,
          data: utf8ToHex("Test"),
        },
      ],
    };
    const basicOutput = await client.buildBasicOutput(outputs);
    console.log(basicOutput);

    const transaction = await account.send(BigInt(1), "snd1qzzlrmeerthts5xsphva8qtfjex7j44nl0qn6c9dx2f4xcpxxx43cuxef3q", {
      allowMicroAmount: true,
    });

    console.log(`Transaction sent: ${transaction.transactionId}`);

    const blockId = await account.retryTransactionUntilIncluded(
      transaction.transactionId
    );

    console.log(`Block sent: ${process.env.EXPLORER_URL}/block/${blockId}`);

    const block = await client.buildAndPostBlock(
      { mnemonic: process.env.MNEMONIC },
      {
        outputs: [basicOutput],
        tag: utf8ToHex("Test"),
        data: utf8ToHex("TEST"),
      }
    );

    // console.log(`Transaction sent: ${transaction.transactionId}`);

    // console.log("Waiting until included in block...");
    // const blockId = await account.retryTransactionUntilIncluded(
    //   transaction.transactionId
    // );
    // console.log(`Block sent: ${process.env.EXPLORER_URL}/block/${blockId}`);

    console.log(`Block sent: ${process.env.EXPLORER_URL}/block/${block[0]}`);
  } catch (error) {
    console.error("Error: ", error);
  }
}

// addTracebility();
async function name() {
  const outputIdsResponse = await client.basicOutputIds([
    {
      address:
        "snd1qzzlrmeerthts5xsphva8qtfjex7j44nl0qn6c9dx2f4xcpxxx43cuxef3q",
    },
  ]);

  console.log(outputIdsResponse);
}

name();
