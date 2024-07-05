const {
  Client,
  initLogger,
  Wallet,
  CoinType,
  Utils,
  SecretManager,
  UnlockConditionType,
  StateControllerAddressUnlockCondition,
  Ed25519Address,
  AliasAddress,
  IssuerFeature,
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
  Resolver,
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
      let listOfDids = [];
      let didId = null;
      const accounts = await wallet.getAccounts();
      const didClient = new IotaIdentityClient(client);

      const account = await wallet.getAccount(accounts[0].getMetadata().alias);
      let alias = await account.sync(); // May want to ensure the account is synced before sending a transaction.

      listOfDids = alias.aliases;

      const did = await didClient.resolveDid(
        IotaDID.fromJSON(`did:iota:snd:${listOfDids[0]}`)
      );

      if (did.properties().get("type") === "Actor") {
        didId = did.id().toString();
      }

      const data = {
        account: accounts[0].getMetadata(),
        did: didId,
      };

      res.status(200).json(data);
    } else {
      throw new Error(
        JSON.stringify({
          type: "error",
          payload: { type: "client", error: "No wallet path found!" },
        })
      );
    }
  } catch (error) {
    res.status(500).json(error);
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

    const address = (await account.generateEd25519Addresses(1))[0];
    console.log(address.address);

    const faucetResponse = await (
      await tempWallet.getClient()
    ).requestFundsFromFaucet(process.env.FAUCET_URL, address.address);

    console.log(faucetResponse);
    setTimeout(() => {
      // Code to be executed after 5 seconds
    }, 5000);
    const didClient = new IotaIdentityClient(client);

    const networkHrp = await didClient.getNetworkHrp();

    // Create a new DID document with a placeholder DID.
    // The DID will be derived from the Alias Id of the Alias Output after publishing.
    const document = new IotaDocument(networkHrp);
    document.setPropertyUnchecked("type", "Actor");

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
    const parsedAddress = Utils.parseBech32Address(address.address);
    const aliasOutput = await didClient.newDidOutput(parsedAddress, document);
    console.log("Alias Output:", JSON.stringify(aliasOutput, null, 2));

    // Publish the Alias Output and get the published DID document.
    const published = await didClient.publishDidOutput(
      {
        stronghold: {
          password: req.body.account.password,
          snapshotPath: process.env.STRONGHOLD_SNAPSHOT_PATH,
        },
      },
      aliasOutput
    );
    console.log("Published DID document:", JSON.stringify(published, null, 2));

    res.status(200).json({ aliasOutput: address.address, did: published.id() });
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
    let didBatches = [];

    const farmerAliasAddress = Utils.aliasIdToBech32(
      new AliasAddress(
        IotaDID.fromJSON(req.body?.did).toAliasId()
      ).getAliasId(),
      "snd"
    );

    const alias = await client.aliasOutputIds([
      {
        issuer: farmerAliasAddress,
      },
    ]);

    for (const id of alias.items) {
      const didID = Utils.computeAliasId(id);
      console.log(didID);
      const did = await didClient.resolveDid(
        IotaDID.fromJSON(`did:iota:snd:${didID}`)
      );

      if (did.properties().get("batchDetails")) {
        const data = {
          address: Utils.aliasIdToBech32(didID, "snd"),
          dateTimeCreated: did.metadataCreated().toRFC3339(),
          dateTimeUpdated: did.metadataUpdated().toRFC3339(),
          produceType: did.properties().get("batchDetails").vineyardDetails
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
    const rentStructure = await didClient.getRentStructure();

    const farmerAliasAddress = new AliasAddress(
      IotaDID.fromJSON(req.body?.did).toAliasId()
    );

    // Create a new DID document with a placeholder DID.
    // The DID will be derived from the Alias Id of the Alias Output after publishing.
    const document = new IotaDocument(networkHrp);
    document.setPropertyUnchecked("batchDetails", req.body?.batchDetails);

    const storage = new Storage(new JwkMemStore(), new KeyIdMemStore());

    // Insert a new Ed25519 verification method in the DID document.
    await document.generateMethod(
      storage,
      JwkMemStore.ed25519KeyType(),
      JwsAlgorithm.EdDSA,
      "#key-1",
      MethodScope.VerificationMethod()
    );

    var aliasOutput = await didClient.newDidOutput(
      farmerAliasAddress,
      document
    );
    console.log("Alias Output:", JSON.stringify(aliasOutput, null, 2));

    aliasOutput = await client.buildAliasOutput({
      ...aliasOutput,
      immutableFeatures: [new IssuerFeature(farmerAliasAddress)],
      aliasId: aliasOutput.getAliasId(),
      unlockConditions: aliasOutput.getUnlockConditions(),
    });

    // Adding the issuer feature means we have to recalculate the required storage deposit.
    aliasOutput = await client.buildAliasOutput({
      ...aliasOutput,
      amount: Utils.computeStorageDeposit(aliasOutput, rentStructure),
      aliasId: aliasOutput.getAliasId(),
      unlockConditions: aliasOutput.getUnlockConditions(),
    });

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

// Endpoint that accepts query parameters
app.get("/api/v1/details", async (req, res) => {
  try {
    const didClient = new IotaIdentityClient(client);

    // Construct a resolver using the client.
    const resolver = new Resolver({
      client: didClient,
    });
    // Access query parameters
    const queryParams = req.query.address;

    const document = await resolver.resolve(
      `did:iota:snd:${Utils.bech32ToHex(queryParams)}`
    );
    res.json({
      batchDetails: document.properties().get("batchDetails"),
      metadata: document.metadata(),
    });
  } catch (error) {
    console.log(error);
    res.status(500).json(error);
  }
});

// Endpoint that accepts query parameters
app.post("/api/v1/addBatchAccessRights", async (req, res) => {
  try {
    const didClient = new IotaIdentityClient(client);
    const requesterDid = req.body?.requesterDid;

    // Construct a resolver using the client.
    const resolver = new Resolver({
      client: didClient,
    });

    const alias = await client.aliasOutputIds([
      {
        sender: req.body.batchAddress,
      },
    ]);
    console.log(alias);
    if (alias.items[0]) {
      const didID = Utils.computeAliasId(alias.items[0]);
      console.log(didID);
      const batchDid = await resolver.resolve(`did:iota:snd:${didID}`); // Get the DID document of the batch.

      // // const requesterDocument = await resolver.resolve(requesterDid);
      // // console.log(requesterDocument)
      // // requesterDocument.
      // // Resolve the latest output and update it with the given document.
      // let aliasOutput = await didClient.updateDidOutput(batchDid);
      // aliasOutput
      //   .getUnlockConditions()
      //   .push(
      //     new StateControllerAddressUnlockCondition(
      //       new Ed25519Address(Utils.bech32ToHex(requesterDocument()))
      //     )
      //   );
      // console.log(aliasOutput.getUnlockConditions());

      // // Because the size of the DID document increased, we have to increase the allocated storage deposit.
      // // This increases the deposit amount to the new minimum.
      // const rentStructure = await didClient.getRentStructure();

      // aliasOutput = await client.buildAliasOutput({
      //   ...aliasOutput,
      //   amount: Utils.computeStorageDeposit(aliasOutput, rentStructure),
      //   aliasId: aliasOutput.getAliasId(),
      //   unlockConditions: aliasOutput.getUnlockConditions(),
      // });

      // // Publish the output.
      // const updated = await didClient.publishDidOutput(
      //   {
      //     stronghold: {
      //       password: req.body?.password,
      //       snapshotPath: process.env.STRONGHOLD_SNAPSHOT_PATH,
      //     },
      //   },
      //   aliasOutput
      // );
      // console.log("Updated DID document:", JSON.stringify(updated, null, 2));
    }
  } catch (error) {
    console.log(error);
    res.status(500).json(error);
  }
});

// Update batch details with traceability data
app.post("/api/v1/addTraceability", async (req, res) => {
  try {
    // Create an identity for the issuer with one verification method `key-1`.
    const ipfs = await import("kubo-rpc-client");

    const ipfsClient = ipfs.create({ url: "http://127.0.0.1:5001" });

    const issuerStorage = new Storage(new JwkMemStore(), new KeyIdMemStore());

    const didClient = new IotaIdentityClient(client);

    // Construct a resolver using the client.
    const resolver = new Resolver({
      client: didClient,
    });

    const alias = await client.aliasOutputIds([
      {
        sender: req.body.batchAddress,
      },
    ]);

    if (alias.items[0]) {
      const didID = Utils.computeAliasId(alias.items[0]);
      const batchDid = await resolver.resolve(`did:iota:snd:${didID}`); // Get the DID document of the batch.
      const issuerDid = await resolver.resolve(req.body.issuerDid); // Get the DID document of the issuer.
      issuerDid.removeMethod(issuerDid.resolveMethod("#jwk").id());

      const fragment = await issuerDid.generateMethod(
        issuerStorage,
        JwkMemStore.ed25519KeyType(),
        JwsAlgorithm.EdDSA,
        "#jwk",
        MethodScope.AssertionMethod()
      );

      console.log(issuerDid);

      // Create a credential subject indicating the degree earned by Alice, linked to their DID.
      const subject = {
        id: batchDid.id(),
        certificationNumber: "13168",
        certifiedEntity: {
          name: "Bonnie House Pty Ltd",
          address:
            "273 Collier Rd, Bayswater Western Australia 6053, Australia",
          facilities: "Unit 3.2 21 South Street, Rydalmere NSW 2116, Australia",
        },
        standards: [
          {
            standardName: "Australian Certified Organic Standard 2021 v1",
            scope: [
              "Contract Processor",
              "Handler",
              "Processor",
              "Exporter",
              "Food",
              "Importer",
              "Independent Contract Processor",
              "Wholesaler",
            ],
            registrationNumber: "39",
          },
          {
            standardName:
              "Australian National Standard for Organic and Biodynamic Produce 3.8",
            scope: [
              "Contract Processor",
              "Handler",
              "Processor",
              "Cosmetics",
              "Exporter",
              "Food",
              "Importer",
              "Independent Contract Processor",
              "Wholesaler",
            ],
            registrationNumber: "AU-BIO-001",
          },
          {
            standardName: "USDA Organic",
            scope: "Handling",
            effectiveDate: "2020-12-04",
            usdaAnniversaryDate: "2023-11-02",
          },
          {
            standardName:
              "Australian Certified Organic Standard (EU Equivalent)",
            scope: "Processed products",
            effectiveDate: "2023-09-02",
            registrationNumber: "AU-BIO-107",
          },
          {
            standardName:
              "Certified to Retained Regulations 834/2007, 889/2008 and 1235/2008 for Exporting Organic Products to Great Britain",
            scope: "Processed products",
          },
        ],
        authorizedBy: {
          name: "Kate Allan",
          title: "General Manager - Certification",
          signature: "C-12732-2023",
        },
      };

      // Create an unsigned `UniversityDegree` credential for Alice
      const unsignedVc = new Credential({
        id: "https://www.bonniehouse.com/information/information&information_id=3",
        type: "OrganicCertificationCredential",
        issuer: issuerDid.id(),
        credentialSubject: subject,
        issuanceDate: new Date().toISOString(),
        expirationDate: new Date(
          new Date().getTime() + 31556952000
        ).toISOString(),
      });

      // Create signed JWT credential.
      const credentialJwt = await issuerDid.createCredentialJwt(
        issuerStorage,
        fragment,
        unsignedVc,
        new JwsSignatureOptions()
      );
      console.log(`Credential JWT > ${credentialJwt.toString()}`);

      // call Core API methods
      const { cid } = await ipfsClient.add(credentialJwt.toJSON());
      console.log("File added to IPFS with CID:", cid.toString());

      // Add the traceability data to the batch DID.
      if (
        !batchDid.properties().get("traceability") ||
        batchDid.properties().get("traceability").length === 0
      ) {
        batchDid.setPropertyUnchecked("traceability", []);
        const traceability = batchDid.properties().get("traceability");
        traceability.push({
          cid: cid.toString(),
          timestamp: new Date().toISOString(),
        });
        batchDid.setPropertyUnchecked("traceability", traceability);
        batchDid.setMetadataUpdated(new Date().toISOString());
      } else {
        const traceability = batchDid.properties().get("traceability");
        console.log(traceability);
        traceability.push({
          cid: cid.toString(),
          timestamp: new Date().toISOString(),
        });
        batchDid.setPropertyUnchecked("traceability", traceability);
        batchDid.setMetadataUpdated(new Date().toISOString());
      }

      const updatedAliasOutput = await didClient.updateDidOutput(batchDid);
      console.log(updatedAliasOutput.getUnlockConditions());
      // Because the size of the DID document increased, we have to increase the allocated storage deposit.
      // This increases the deposit amount to the new minimum.
      const rentStructure = await didClient.getRentStructure();

      aliasOutput = await client.buildAliasOutput({
        ...updatedAliasOutput,
        amount: Utils.computeStorageDeposit(updatedAliasOutput, rentStructure),
        aliasId: updatedAliasOutput.getAliasId(),
        unlockConditions: updatedAliasOutput.getUnlockConditions(),
      });

      // Publish the updated batch DID Document
      const updated = await didClient.publishDidOutput(
        {
          stronghold: {
            password: req.body?.password,
            snapshotPath: process.env.STRONGHOLD_SNAPSHOT_PATH,
          },
        },
        aliasOutput
      );
      console.log(
        "Updated Batch DID Document Published:",
        JSON.stringify(updated, null, 2)
      );

      // Add the traceability data to the actor DID.

      if (
        !issuerDid.properties().get(req.body.type) ||
        issuerDid.properties().get(req.body.type).length === 0
      ) {
        issuerDid.setPropertyUnchecked(req.body.type, []);
        const traceability = issuerDid.properties().get(req.body.type);
        traceability.push({
          cid: cid.toString(),
          timestamp: new Date().toISOString(),
        });
        issuerDid.setPropertyUnchecked(req.body.type, traceability);
        issuerDid.setMetadataUpdated(new Date().toISOString());
      } else {
        const traceability = issuerDid.properties().get(req.body.type);
        traceability.push({
          cid: cid.toString(),
          timestamp: new Date().toISOString(),
        });
        issuerDid.setPropertyUnchecked(req.body.type, traceability);
        issuerDid.setMetadataUpdated(new Date().toISOString());
      }

      const updatedIssuerAliasOutput = await didClient.updateDidOutput(
        issuerDid
      );

      // Because the size of the DID document increased, we have to increase the allocated storage deposit.
      // This increases the deposit amount to the new minimum.
      const issuerRentStructure = await didClient.getRentStructure();

      aliasOutput = await client.buildAliasOutput({
        ...updatedIssuerAliasOutput,
        amount: Utils.computeStorageDeposit(
          updatedIssuerAliasOutput,
          issuerRentStructure
        ),
        aliasId: updatedIssuerAliasOutput.getAliasId(),
        unlockConditions: updatedIssuerAliasOutput.getUnlockConditions(),
      });

      // Publish the updated batch DID Document
      const updatedIssuer = await didClient.publishDidOutput(
        {
          stronghold: {
            password: req.body?.password,
            snapshotPath: process.env.STRONGHOLD_SNAPSHOT_PATH,
          },
        },
        aliasOutput
      );
      console.log(
        "Updated Batch DID Document Published:",
        JSON.stringify(updatedIssuer, null, 2)
      );
      console.log(issuerDid);
      // Before sending this credential to the holder the issuer wants to validate that some properties
      // of the credential satisfy their expectations.

      // Validate the credential's signature, the credential's semantic structure,
      // check that the issuance date is not in the future and that the expiration date is not in the past.
      // Note that the validation returns an object containing the decoded credential.
      // const decoded_credential = new JwtCredentialValidator(
      //   new EdDSAJwsVerifier()
      // ).validate(
      //   credentialJwt,
      //   issuerDid,
      //   new JwtCredentialValidationOptions(),
      //   FailFast.FirstError
      // );

      // // Since `validate` did not throw any errors we know that the credential was successfully validated.
      // console.log(`VC successfully validated`);

      // // The issuer is now sure that the credential they are about to issue satisfies their expectations.
      // // Note that the credential is NOT published to the IOTA Tangle. It is sent and stored off-chain.
      // console.log(
      //   `Issued credential: ${JSON.stringify(
      //     decoded_credential.intoCredential(),
      //     null,
      //     2
      //   )}`
      // );
    }
  } catch (error) {
    console.error("Error: ", error);
    res.status(500).json(error);
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});