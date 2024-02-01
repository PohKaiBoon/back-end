const createTransaction = artifacts.require("createTransaction");

module.exports = function (deployer) {
  deployer.deploy(createTransaction);
  // deployer.deploy();
};
