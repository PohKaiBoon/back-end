const { Client } = require("@iota/sdk");
const { Utils } = require("@iota/sdk");

async function checkHealth(client) {
  try {
    const nodeInfo = await client.getInfo();
    console.log("Node info: ", nodeInfo);
    console.log("Node checked health successfully");
  } catch (error) {
    console.error("Error: ", error);
  }
}

// In this example we will generate a random BIP39 mnemonic
async function generateMnemonic() {
  try {
    const mnemonic = Utils.generateMnemonic();
    console.log("Mnemonic: " + mnemonic);
  } catch (error) {
    console.error("Error: ", error);
  }
}

/** Request funds from the faucet API, if needed, and wait for them to show in the wallet. */
async function ensureAddressHasFunds(client, addressBech32) {
  let balance = await getAddressBalance(client, addressBech32);
  if (balance > BigInt(0)) {
    return;
  }

  await requestFundsFromFaucet(addressBech32);

  for (let i = 0; i < 9; i++) {
    // Wait for the funds to reflect.
    await new Promise((f) => setTimeout(f, 5000));

    let balance = await getAddressBalance(client, addressBech32);
    if (balance > BigInt(0)) {
      break;
    }
  }
}

/** Returns the balance of the given Bech32-encoded address. */
async function getAddressBalance(client, addressBech32) {
  const outputIds = await client.basicOutputIds([
    { address: addressBech32 },
    { hasExpiration: false },
    { hasTimelock: false },
    { hasStorageDepositReturn: false },
  ]);
  const outputs = await client.getOutputs(outputIds.items);

  let totalAmount = BigInt(0);
  for (const output of outputs) {
    totalAmount += output.output.getAmount();
  }

  return totalAmount;
}

/** Request tokens from the faucet API. */
async function requestFundsFromFaucet(addressBech32) {
  const requestObj = JSON.stringify({ address: addressBech32 });
  let errorMessage, data;
  try {
    const response = await fetch(process.env.FAUCET_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: requestObj,
    });
    if (response.status === 202) {
      errorMessage = "OK";
      console.log("Request from faucet ok");
    } else if (response.status === 429) {
      errorMessage = "too many requests, please try again later.";
    } else {
      data = await response.json();
      errorMessage = data.error.message;
    }
  } catch (error) {
    errorMessage = error;
  }

  if (errorMessage != "OK") {
    throw new Error(`failed to get funds from faucet: ${errorMessage}`);
  }
}

module.exports = {
  generateMnemonic,
  checkHealth,
  ensureAddressHasFunds,
};
