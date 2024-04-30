const {
  Client,
  initLogger,
  utf8ToHex,
  hexToUtf8,
  TaggedDataPayload,
  Wallet,
  CoinType,
} = require("@iota/sdk");
const { checkHealth } = require("./utils/utils");
require("dotenv").config({ path: ".env" });

initLogger();

const client = new Client({
  nodes: [process.env.NODE_URL],
  localPow: true,
});

const alias = "Wine Processor";

// checkHealth(client);
// createWallet("Wine Processor").then(() => process.exit());

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
  initLogger();
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
    const address =
      "rms1qpszqzadsym6wpppd6z037dvlejmjuke7s24hm95s9fg9vpua7vluaw60xu";
    const amount = BigInt(1);

    const transaction = await account.send(amount, address, {
      allowMicroAmount: true,
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

sendMicroTransaction().then(() => process.exit());
