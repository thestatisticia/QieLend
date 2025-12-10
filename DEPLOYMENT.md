# QieLend Deployment Guide

## 🚀 Quick Deployment Steps

### Option 1: Using Remix IDE (Recommended for Quick Deployment)

1. **Go to Remix IDE**: https://remix.ethereum.org/

2. **Create Contract File**:
   - Click "File Explorer" → "Create New File"
   - Name it `QieLend.sol`
   - Copy entire content from `contracts/QieLend.sol`

3. **Compile**:
   - Go to "Solidity Compiler" tab
   - Select compiler version: **0.8.20**
   - Click "Compile QieLend.sol"
   - Check for errors

4. **Connect Wallet**:
   - Go to "Deploy & Run Transactions" tab
   - Select "Injected Provider - MetaMask"
   - Make sure MetaMask is connected to QIE Mainnet (Chain ID: 1990)
   - If not, add QIE Mainnet to MetaMask:
     - Network Name: QIE Mainnet
     - RPC URL: https://rpc1mainnet.qie.digital/
     - Chain ID: 1990
     - Currency Symbol: QIE

5. **Deploy**:
   - In constructor field, enter QIE token address
   - Click "Deploy"
   - Confirm transaction in MetaMask
   - **Copy the deployed contract address**

6. **Update Frontend**:
   - Create `.env` file in project root:
     ```
     VITE_QIE_CONTRACT_ADDRESS=0xYourDeployedContractAddress
     ```
   - Or update `src/App.jsx` line 18 with the contract address

### Option 2: Using Hardhat

1. **Install Hardhat**:
   ```bash
   npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox
   ```

2. **Initialize Hardhat**:
   ```bash
   npx hardhat init
   ```
   Select: "Create a JavaScript project"

3. **Create `hardhat.config.js`**:
   ```javascript
   require("@nomicfoundation/hardhat-toolbox");
   require("dotenv").config();

   module.exports = {
     solidity: "0.8.20",
     networks: {
       qie: {
         url: "https://rpc1mainnet.qie.digital/",
         accounts: [process.env.PRIVATE_KEY]
       }
     }
   };
   ```

4. **Create `.env` file** (add to `.gitignore`):
   ```
   PRIVATE_KEY=your_private_key_here
   ```

5. **Copy Contract**:
   - Copy `contracts/QieLend.sol` to `contracts/` folder in Hardhat project

6. **Create Deployment Script** (`scripts/deploy.js`):
   ```javascript
   const hre = require("hardhat");

   async function main() {
     const QIE_TOKEN_ADDRESS = "0x..."; // Replace with actual QIE token address
     
     const QieLend = await hre.ethers.getContractFactory("QieLend");
     const qieLend = await QieLend.deploy(QIE_TOKEN_ADDRESS);

     await qieLend.waitForDeployment();
     const address = await qieLend.getAddress();

     console.log("QieLend deployed to:", address);
   }

   main().catch((error) => {
     console.error(error);
     process.exitCode = 1;
   });
   ```

7. **Deploy**:
   ```bash
   npx hardhat run scripts/deploy.js --network qie
   ```

## 📝 Important Notes

### QIE Token Address

You need the QIE ERC20 token contract address. Options:

1. **If QIE Network has an official ERC20 token**: Use that address
2. **If using native QIE**: Deploy `contracts/QIEToken.sol` first as a wrapped token
3. **Check QIE documentation**: Look for official token contract address

### Private Key Security

⚠️ **CRITICAL**: 
- **NEVER** commit private keys to git
- Use `.env` file and add to `.gitignore`
- After deployment, **remove private key from all files**
- Consider using a hardware wallet for production

### After Deployment

1. **Save Contract Address**: 
   - Update `.env` file: `VITE_QIE_CONTRACT_ADDRESS=0x...`
   - Or update `src/App.jsx` directly

2. **Verify Contract** (Optional):
   - Go to https://mainnet.qie.digital/
   - Search for your contract
   - Verify source code for transparency

3. **Test Integration**:
   - Start frontend: `npm run dev`
   - Connect wallet
   - Test supply/withdraw functions

## 🔗 Integration

The frontend is already set up to work with the contract:
- Contract ABI: `src/contracts/QieLendABI.json`
- Contract utilities: `src/utils/contract.js`
- Just update the contract address and it will work!

## 📞 Support

If you encounter issues:
1. Check QIE Network RPC is accessible
2. Verify you have enough QIE for gas
3. Ensure contract compiled without errors
4. Check MetaMask is on correct network (Chain ID: 1990)


