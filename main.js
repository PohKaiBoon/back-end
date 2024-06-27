const {
  Client,
  initLogger,
  Wallet,
  CoinType,
  Utils,
  SecretManager,
} = require("@iota/sdk");
const {
  Jwk,
  JwkType,
  EdCurve,
  MethodScope,
  IotaDocument,
  IotaIdentityClient,
  Storage,
  JwkMemStore,
  KeyIdMemStore,
  JwsAlgorithm,
  Credential,
  IotaDID,
  FailFast,
  JwsSignatureOptions,
  JwtCredentialValidator,
  JwtCredentialValidationOptions,
  EdDSAJwsVerifier,
  Jwt,
} = require("@iota/identity-wasm/node");
const express = require("express");
const bodyParser = require("body-parser");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: ".env" });
const errors = require("./constants/error-constants");
const cors = require("cors");
const {
  ensureAddressHasFunds,
  convertToHumanReadable,
} = require("./utils/utils");

const app = express();
app.use(cors());
const port = process.env.PORT || 3000;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

initLogger();

const client = new Client({
  nodes: [process.env.NODE_URL],
  localPow: true,
});

let wallet = null;

try {
  const directoryPath = path.join(__dirname, process.env.WALLET_DB_PATH);
  // Check if the directory exists
  if (fs.existsSync(directoryPath)) {
    wallet = new Wallet({
      storagePath: process.env.WALLET_DB_PATH,
    });
  }
} catch (error) {
  console.error(error);
}

/* Authentication Related Endpoints Starts Here */

// Check Health of Node
app.get("/api/v1/checkHealth", async (req, res) => {
  try {
    const nodeInfo = await client.getInfo();
    res.status(200).json(nodeInfo);
  } catch (error) {
    console.error("Error: ", error);
    res.status(500).json(JSON.parse(error));
  }
});

// Login/Check if wallet exists
app.get("/api/v1/checkWallet", async (req, res) => {
  if (!"WALLET_DB_PATH" in process.env)
    res.status(500).json(errors.generic500Error);

  try {
    if (wallet) {
      const accounts = await wallet.getAccounts();
      res.status(200).json(accounts[0].getMetadata());
    } else {
      throw new Error(
        JSON.stringify({
          type: "error",
          payload: { type: "client", error: "No wallet path found!" },
        })
      );
    }
  } catch (error) {
    res.status(500).json(JSON.parse(error.toString().replace("Error: ", "")));
    console.log(error);
  }
});

// Register/Create Wallet
app.post("/api/v1/createWallet", async (req, res) => {
  for (const envVar of [
    "NODE_URL",
    "STRONGHOLD_PASSWORD",
    "STRONGHOLD_SNAPSHOT_PATH",
    "MNEMONIC",
    "WALLET_DB_PATH",
  ])
    if (!(envVar in process.env)) {
      res.status(500).json(errors.generic500Error);
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
          password: req.body.account.password,
        },
      },
    };

    let tempWallet = new Wallet(walletOptions);

    // A mnemonic can be generated with `Utils.generateMnemonic()`.
    // Store the mnemonic in the Stronghold snapshot, this needs to be done only the first time.
    // The mnemonic can't be retrieved from the Stronghold file, so make a backup in a secure place!
    await tempWallet.storeMnemonic(req.body.mnemonic.join(" "));

    // Create a new account
    const account = await tempWallet.createAccount({
      alias: req.body.account.accountName,
    });
    console.log("Generated new account:", account.getMetadata().alias);
    res.status(200).send();
    wallet = tempWallet;
  } catch (error) {
    res.status(500).json(error).send();
    console.error("Error: ", error);
  }
});

// Create a Seed Mnemonic
app.get("/api/v1/generateMnemonic", async (req, res) => {
  try {
    const mnemonic = Utils.generateMnemonic();
    res.status(200).json({ mnemonic: mnemonic.split(" ") });
  } catch (error) {
    console.error("Error: ", error);
    res.status(500).json(JSON.parse(error));
    exit();
  }
});

/* Authentication Related Endpoints Ends Here */

/* Addresses/Batch ID Related Endpoints Starts Here */

// Check addresses/batches under wallet/account
app.post("/api/v1/getAllBatches", async (req, res) => {
  try {
    const didClient = new IotaIdentityClient(client);
    let listOfDids = [];
    let didBatches = [];

    const account = await wallet.getAccount(req.body?.alias);
    let alias = await account.sync(); // May want to ensure the account is synced before sending a transaction.

    listOfDids = alias.aliases;

    for (const id of listOfDids) {
      const did = await didClient.resolveDid(
        IotaDID.fromJSON(`did:iota:snd:${id}`)
      );

      if (did.properties().get("harvestDate")) {
        const data = {
          address: did.metadataGovernorAddress(),
          dateTimeCreated: did.metadataCreated().toRFC3339(),
          dateTimeUpdated: did.metadataUpdated().toRFC3339(),
          produceType: did.properties().get("harvestDate").vineyardDetails
            ?.grapeVariety,
        };
        didBatches.push(data);
      }
    }

    // console.log(didBatches);
    res.status(200).json(didBatches);
  } catch (error) {
    console.error("Error: ", error);
    res.status(500).json(JSON.parse(error));
    exit();
  }
});

app.post("/api/v1/generateAddress", async (req, res) => {
  try {
    const account = await wallet.getAccount(req.body?.alias);
    // To create an address we need to unlock stronghold.
    await wallet.setStrongholdPassword(req.body?.password);

    const address = (await account.generateEd25519Addresses(1))[0];
    console.log(address.address);

    const faucetResponse = await (
      await wallet.getClient()
    ).requestFundsFromFaucet(process.env.FAUCET_URL, address.address);

    res.status(200).json(JSON.parse(faucetResponse));

    // console.log(published.id());
  } catch (error) {
    console.error(error);
    res.status(500).json(error);
  }
});

app.post("/api/v1/submitBatch", async (req, res) => {
  try {
    const didClient = new IotaIdentityClient(client);

    const networkHrp = await didClient.getNetworkHrp();
    console.log(networkHrp);

    console.log("Wallet address Bech32:", req.body?.address);

    // Create a new DID document with a placeholder DID.
    // The DID will be derived from the Alias Id of the Alias Output after publishing.
    const document = new IotaDocument(networkHrp);
    document.setPropertyUnchecked("harvestDate", req.body?.batchDetails);

    const storage = new Storage(new JwkMemStore(), new KeyIdMemStore());

    // Insert a new Ed25519 verification method in the DID document.
    await document.generateMethod(
      storage,
      JwkMemStore.ed25519KeyType(),
      JwsAlgorithm.EdDSA,
      "#key-1",
      MethodScope.VerificationMethod()
    );

    // Construct an Alias Output containing the DID document, with the wallet address
    // set as both the state controller and governor.
    const address = Utils.parseBech32Address(req.body?.address);
    const aliasOutput = await didClient.newDidOutput(address, document);
    console.log("Alias Output:", JSON.stringify(aliasOutput, null, 2));

    // Publish the Alias Output and get the published DID document.
    const published = await didClient.publishDidOutput(
      {
        stronghold: {
          password: req.body?.password,
          snapshotPath: process.env.STRONGHOLD_SNAPSHOT_PATH,
        },
      },
      aliasOutput
    );
    console.log("Published DID document:", JSON.stringify(published, null, 2));

    res.status(200).json([]);

    // console.log(published.id());
  } catch (error) {
    console.error("Error: ", error);
    res.status(500).json(error);
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

// const account = await wallet.getAccount(req.body?.alias);
//     // To create an address we need to unlock stronghold.
//     await wallet.setStrongholdPassword(req.body?.password);

//     const address = (await account.generateEd25519Addresses(1))[0];
//     console.log(address.address);

//     const faucetResponse = await (
//       await wallet.getClient()
//     ).requestFundsFromFaucet(process.env.FAUCET_URL, address.address);

//     await account.sync();

//     const add = await account.addresses();
//     console.log("CREATED ADDRESS LIST:");
//     console.log(add);

//     const transactions = await account.transactions();
//     console.log("Sent transactions:");
//     for (const transaction of transactions)
//       console.log(transaction.transactionId);

//     res.status(200).json(JSON.parse(faucetResponse));
