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
const { Client, SecretManager, Utils, Wallet, hexToUtf8 } = require("@iota/sdk");
const { ensureAddressHasFunds } = require("./utils/utils");
require("dotenv").config({ path: ".env" });

// const EXAMPLE_JWK = new Jwk({
//   kty: JwkType.Okp,
//   crv: EdCurve.Ed25519,
//   x: "11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo",
// });

const client = new Client({
  nodes: [process.env.NODE_URL],
  localPow: true,
});
const didClient = new IotaIdentityClient(client);

async function createIdentity() {
  // Get the Bech32 human-readable part (HRP) of the network.
  const networkHrp = await didClient.getNetworkHrp();

  const secretManager = new SecretManager({ mnemonic: process.env.MNEMONIC });

  const walletAddressBech32 = (
    await secretManager.generateEd25519Addresses({
      accountIndex: 0,
      range: {
        start: 0,
        end: 1,
      },
      bech32Hrp: networkHrp,
    })
  )[0];

  console.log("Wallet address Bech32:", walletAddressBech32);

  await ensureAddressHasFunds(client, walletAddressBech32);

  // Create a new DID document with a placeholder DID.
  // The DID will be derived from the Alias Id of the Alias Output after publishing.
  const document = new IotaDocument(networkHrp);
  document.setPropertyUnchecked("batchDetails", "test")
  const storage = new Storage(new JwkMemStore(), new KeyIdMemStore());

  document.properties().set("harvestDate", "2024-06-26")
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
  const address = Utils.parseBech32Address(walletAddressBech32);
  const aliasOutput = await didClient.newDidOutput(address, document);
  console.log("Alias Output:", JSON.stringify(aliasOutput, null, 2));

  // Publish the Alias Output and get the published DID document.
  const published = await didClient.publishDidOutput(
    { mnemonic: process.env.MNEMONIC },
    aliasOutput
  );
  console.log("Published DID document:", JSON.stringify(published, null, 2));

  console.log(published.id());
  return {
    didClient,
    secretManager,
    walletAddressBech32,
    did: published.id(),
  };
}

async function createVC() {
  // Create an identity for the issuer with one verification method `key-1`.
  const ipfs = await import("kubo-rpc-client");

  const ipfsClient = ipfs.create({ url: "http://127.0.0.1:5001" });

  const issuerStorage = new Storage(new JwkMemStore(), new KeyIdMemStore());

  const testtt = await didClient.getAliasOutput(
    "0x86fc952ee4732f13b2a4a41c5f4b758cb80d03842e4ccf1ba9d62af454a26f47"
  );
  console.log(testtt, "DID ALIAS OUTPUT");

  const fragment = await did.generateMethod(
    issuerStorage,
    JwkMemStore.ed25519KeyType(),
    JwsAlgorithm.EdDSA,
    "#jwk",
    MethodScope.AssertionMethod()
  );

  // Create a credential subject indicating the degree earned by Alice, linked to their DID.
  const subject = {
    id: did.id(),
    name: "Alice",
    degreeName: "Bachelor of Science and Arts",
    degreeType: "BachelorDegree",
    GPA: "4.0",
  };

  // Create an unsigned `UniversityDegree` credential for Alice
  const unsignedVc = new Credential({
    id: "https://example.edu/credentials/3732",
    type: "UniversityDegreeCredential",
    issuer: did.id(),
    credentialSubject: subject,
  });

  // Create signed JWT credential.
  const credentialJwt = await did.createCredentialJwt(
    issuerStorage,
    fragment,
    unsignedVc,
    new JwsSignatureOptions()
  );
  console.log(`Credential JWT > ${credentialJwt.toString()}`);

  // call Core API methods
  const { cid } = await ipfsClient.add(credentialJwt.toJSON());
  console.log("File added to IPFS with CID:", cid.toString());

  // Before sending this credential to the holder the issuer wants to validate that some properties
  // of the credential satisfy their expectations.

  // Validate the credential's signature, the credential's semantic structure,
  // check that the issuance date is not in the future and that the expiration date is not in the past.
  // Note that the validation returns an object containing the decoded credential.
  const decoded_credential = new JwtCredentialValidator(
    new EdDSAJwsVerifier()
  ).validate(
    credentialJwt,
    did,
    new JwtCredentialValidationOptions(),
    FailFast.FirstError
  );

  JwtCredentialValidator.extractIssuerFromJwt();

  // Since `validate` did not throw any errors we know that the credential was successfully validated.
  console.log(`VC successfully validated`);

  // The issuer is now sure that the credential they are about to issue satisfies their expectations.
  // Note that the credential is NOT published to the IOTA Tangle. It is sent and stored off-chain.
  console.log(
    `Issued credential: ${JSON.stringify(
      decoded_credential.intoCredential(),
      null,
      2
    )}`
  );
}

// console.log(createIdentity());
// createVC();

name();

async function name() {
  const test = JwtCredentialValidator.extractIssuerFromJwt(
    Jwt.fromJSON(
      "eyJraWQiOiJkaWQ6aW90YTpzbmQ6MHg4NmZjOTUyZWU0NzMyZjEzYjJhNGE0MWM1ZjRiNzU4Y2I4MGQwMzg0MmU0Y2NmMWJhOWQ2MmFmNDU0YTI2ZjQ3I2p3ayIsInR5cCI6IkpXVCIsImFsZyI6IkVkRFNBIn0.eyJpc3MiOiJkaWQ6aW90YTpzbmQ6MHg4NmZjOTUyZWU0NzMyZjEzYjJhNGE0MWM1ZjRiNzU4Y2I4MGQwMzg0MmU0Y2NmMWJhOWQ2MmFmNDU0YTI2ZjQ3IiwibmJmIjoxNzE4Nzk1NTUwLCJqdGkiOiJodHRwczovL2V4YW1wbGUuZWR1L2NyZWRlbnRpYWxzLzM3MzIiLCJzdWIiOiJkaWQ6aW90YTpzbmQ6MHg4NmZjOTUyZWU0NzMyZjEzYjJhNGE0MWM1ZjRiNzU4Y2I4MGQwMzg0MmU0Y2NmMWJhOWQ2MmFmNDU0YTI2ZjQ3IiwidmMiOnsiQGNvbnRleHQiOiJodHRwczovL3d3dy53My5vcmcvMjAxOC9jcmVkZW50aWFscy92MSIsInR5cGUiOlsiVmVyaWZpYWJsZUNyZWRlbnRpYWwiLCJVbml2ZXJzaXR5RGVncmVlQ3JlZGVudGlhbCJdLCJjcmVkZW50aWFsU3ViamVjdCI6eyJHUEEiOiI0LjAiLCJkZWdyZWVOYW1lIjoiQmFjaGVsb3Igb2YgU2NpZW5jZSBhbmQgQXJ0cyIsImRlZ3JlZVR5cGUiOiJCYWNoZWxvckRlZ3JlZSIsIm5hbWUiOiJBbGljZSJ9fX0.WxMVYWb6YBDoNgUWNQr4-lKwk7PcLBRqOohXRysT35_WfmKQROE8K-1tJgzBY-5Qn6s3f5pMxlm71eWxbQwBBA"
    )
  );

  // console.log(test.toString());
// 
  const did = await didClient.resolveDid(
    IotaDID.fromJSON(
      "did:iota:snd:0xe388a2f783ca9f1864e2bfbe7d9e1b198e8f25a80002a86e583fb75cbd226114"
    )
  );

  console.log(did.properties());
  console.log(did.metadata())
  
}
// 
// findAllAliasOutputs()
async function findAllAliasOutputs() {
  const wallet = new Wallet({
    storagePath: process.env.WALLET_DB_PATH,
  });

  // Get the account we generated with `01-create-wallet`
  const account = await wallet.getAccount("wallet");

  // May want to ensure the account is synced before sending a transaction.
  let balance = await account.sync();

  console.log(`Aliases BEFORE:\n`, balance.aliases);
}
