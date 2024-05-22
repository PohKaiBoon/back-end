const {
  Client,
  initLogger,
  utf8ToHex,
  hexToUtf8,
  TaggedDataPayload,
  Wallet,
  CoinType,
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

client

initLogger();
preChecks(client);

async function preChecks(client) {
  await checkHealth(client);
  await checkIfWalletExists();
}

async function run() {
  for (const envVar of ["NODE_URL", "EXPLORER_URL"]) {
    if (!(envVar in process.env)) {
      throw new Error(`.env ${envVar} is undefined, see .env.example`);
    }
  }
  const data = {
    id: 1,
  };

  const options = {
    tag: utf8ToHex("Hello"),
    data: utf8ToHex(JSON.stringify(data)),
  };

  try {
    const mnemonic = process.env.MNEMONIC;
    const secretManager = { mnemonic: mnemonic };

    // Create block with tagged payload
    const blockIdAndBlock = await client.buildAndPostBlock(
      secretManager,
      options
    );

    console.log(blockIdAndBlock);

    console.log(
      `Block sent: ${process.env.EXPLORER_URL}/block/${blockIdAndBlock[0]}`
    );

    const fetchedBlock = await client.getBlock(blockIdAndBlock[0]);
    console.log("Block data: ", fetchedBlock);

    if (fetchedBlock.payload instanceof TaggedDataPayload) {
      const payload = fetchedBlock.payload;
      console.log("Decoded data:", hexToUtf8(payload.data));
    }
  } catch (error) {
    console.error("Error: ", error);
  }
}

async function checkIfWalletExists() {
  if (!"WALLET_DB_PATH" in process.env) return false;

  const directoryPath = path.join(__dirname, process.env.WALLET_DB_PATH);

  // Check if the directory exists
  if (fs.existsSync(directoryPath)) {
    console.log("Wallet found, not creating new wallet");
  } else {
    console.log("Directory does not exist, creating wallet based on ENV file wallet name");
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

// sendMicroTransaction("bob").then(() => process.exit());

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

    const wallet = new Wallet({
      storagePath: process.env.WALLET_DB_PATH,
    });

    const account = await wallet.getAccount(alias);

    await account.sync();
    console.log(await account.sync());

    // const fetchedBlock = await client.getBlock('0x2cd71a3e3ec74723156751f5a2c4160e2efca2baf6ead8587905e18f37dbdafa');
    // console.log('Block data: ', fetchedBlock);
  } catch (error) {
    console.error("Error: ", error);
  }
}

// viewBlockDetails("bob").then(() => process.exit());
