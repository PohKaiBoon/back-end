const { Client, initLogger } = require('@iota/sdk');
const { checkHealth } = require('./utils/utils');
require('dotenv').config()

initLogger();

const client = new Client({
  nodes: [process.env.NODE_URL],
  localPow: true,
});

checkHealth(client);



