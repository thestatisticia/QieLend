const hre = require("hardhat");

async function main() {
  const PointsCalculator = await hre.ethers.getContractFactory("PointsCalculator");
  const contract = await PointsCalculator.deploy();
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log("PointsCalculator deployed to:", address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

