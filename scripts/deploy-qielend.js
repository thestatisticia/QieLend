import hre from "hardhat";

async function main() {
  console.log("🚀 QieLend Deployment Script\n");

  // Get deployer account
  const [deployer] = await hre.ethers.getSigners();
  console.log("📡 Connected to QIE Mainnet");
  console.log("👤 Deployer address:", deployer.address);

  // Check balance
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("💰 Balance:", hre.ethers.formatEther(balance), "QIE\n");

  if (balance === 0n) {
    throw new Error("Insufficient balance for deployment");
  }

  // QIE Token Address - You may need to deploy QIEToken.sol first or use existing token
  // For now, we'll need to get this from the user or deploy QIEToken first
  const QIE_TOKEN_ADDRESS = process.env.QIE_TOKEN_ADDRESS || "0x0000000000000000000000000000000000000000";

  if (QIE_TOKEN_ADDRESS === "0x0000000000000000000000000000000000000000") {
    console.log("⚠️  WARNING: QIE_TOKEN_ADDRESS is not set!");
    console.log("   Options:");
    console.log("   1. Set QIE_TOKEN_ADDRESS in .env file");
    console.log("   2. Deploy QIEToken.sol first and use that address");
    console.log("   3. Use the official QIE token address if available\n");
    
    // For now, let's try to deploy QIEToken first if it doesn't exist
    console.log("📦 Attempting to deploy QIEToken first...\n");
    try {
      const QIEToken = await hre.ethers.getContractFactory("QIEToken");
      const qieToken = await QIEToken.deploy();
      await qieToken.waitForDeployment();
      const qieTokenAddress = await qieToken.getAddress();
      console.log("✅ QIEToken deployed to:", qieTokenAddress);
      console.log("   Using this address for QieLend constructor\n");
      
      // Now deploy QieLend with the QIEToken address
      const QieLend = await hre.ethers.getContractFactory("QieLend");
      console.log("📦 Deploying QieLend contract...");
      const qieLend = await QieLend.deploy(qieTokenAddress);
      
      console.log("⏳ Transaction sent, waiting for confirmation...");
      const txHash = qieLend.deploymentTransaction().hash;
      console.log("   Tx hash:", txHash);
      
      await qieLend.waitForDeployment();
      const contractAddress = await qieLend.getAddress();

      console.log("\n✅ QieLend deployed successfully!");
      console.log("📍 Contract Address:", contractAddress);
      console.log("📍 QIEToken Address:", qieTokenAddress);
      console.log("🔗 Explorer:", `https://mainnet.qie.digital/address/${contractAddress}\n`);

      // Save deployment info
      const deploymentInfo = {
        qieLendAddress: contractAddress,
        qieTokenAddress: qieTokenAddress,
        deployer: deployer.address,
        network: "QIE Mainnet",
        rpcUrl: "https://rpc1mainnet.qie.digital/",
        deployedAt: new Date().toISOString(),
        txHash: txHash,
      };

      console.log("📋 Deployment Information:");
      console.log(JSON.stringify(deploymentInfo, null, 2));
      console.log("\n⚠️  SECURITY: Remove private key from .env file now!\n");
      console.log("📝 Next steps:");
      console.log("   1. Update .env file: VITE_QIE_CONTRACT_ADDRESS=" + contractAddress);
      console.log("   2. Update .env file: VITE_QIE_TOKEN_ADDRESS=" + qieTokenAddress);
      console.log("   3. Remove PRIVATE_KEY from .env file");
      console.log("   4. Test the integration in the frontend\n");

      return deploymentInfo;
    } catch (error) {
      console.error("❌ Deployment failed:", error.message);
      throw error;
    }
  } else {
    // Deploy QieLend with provided QIE token address
    console.log("📦 Deploying QieLend contract with QIE token:", QIE_TOKEN_ADDRESS);
    const QieLend = await hre.ethers.getContractFactory("QieLend");
    const qieLend = await QieLend.deploy(QIE_TOKEN_ADDRESS);
    
    console.log("⏳ Transaction sent, waiting for confirmation...");
    const txHash = qieLend.deploymentTransaction().hash;
    console.log("   Tx hash:", txHash);
    
    await qieLend.waitForDeployment();
    const contractAddress = await qieLend.getAddress();

    console.log("\n✅ QieLend deployed successfully!");
    console.log("📍 Contract Address:", contractAddress);
    console.log("🔗 Explorer:", `https://mainnet.qie.digital/address/${contractAddress}\n`);

    // Save deployment info
    const deploymentInfo = {
      contractAddress: contractAddress,
      qieTokenAddress: QIE_TOKEN_ADDRESS,
      deployer: deployer.address,
      network: "QIE Mainnet",
      rpcUrl: "https://rpc1mainnet.qie.digital/",
      deployedAt: new Date().toISOString(),
      txHash: txHash,
    };

    console.log("📋 Deployment Information:");
    console.log(JSON.stringify(deploymentInfo, null, 2));
    console.log("\n⚠️  SECURITY: Remove private key from .env file now!\n");
    console.log("📝 Next steps:");
    console.log("   1. Update .env file: VITE_QIE_CONTRACT_ADDRESS=" + contractAddress);
    console.log("   2. Remove PRIVATE_KEY from .env file");
    console.log("   3. Test the integration in the frontend\n");

    return deploymentInfo;
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

