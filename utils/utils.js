const { Client } = require('@iota/sdk');
const { Utils } = require('@iota/sdk');

async function checkHealth(client) {
    try {
        const nodeInfo = await client.getInfo();
        console.log('Node info: ', nodeInfo);
    } catch (error) {
        console.error('Error: ', error);
    }
}

// In this example we will generate a random BIP39 mnemonic
async function generateMnemonic() {
    try {
        const mnemonic = Utils.generateMnemonic();
        console.log('Mnemonic: ' + mnemonic);
    } catch (error) {
        console.error('Error: ', error);
    }
}

module.exports = {generateMnemonic, checkHealth}
