# Deployment Instructions for QieLend Contract

## Quick Deployment Using Remix IDE

### Step 1: Prepare Contract
1. Go to https://remix.ethereum.org/
2. Create a new file: `QieLend.sol`
3. Copy the entire contract from `contracts/QieLend.sol`

### Step 2: Compile
1. Select Solidity compiler version **0.8.20**
2. Click "Compile QieLend.sol"
3. Check for any compilation errors

### Step 3: Deploy
1. Go to "Deploy & Run Transactions" tab
2. Select "Injected Provider - MetaMask" (connect your wallet)
3. Make sure you're on QIE Mainnet (Chain ID: 1990)
4. In the constructor, enter the QIE token address:
   - If using native QIE: Use the wrapped QIE token address
   - If deploying QIEToken first: Deploy QIEToken.sol first, then use its address
5. Click "Deploy"
6. Confirm transaction in MetaMask

### Step 4: Get Contract Address
1. After deployment, copy the contract address
2. Update `src/App.jsx` with the contract address
3. Or set environment variable: `VITE_QIE_CONTRACT_ADDRESS=0x...`

### Step 5: Verify Contract (Optional)
1. Go to https://mainnet.qie.digital/
2. Search for your contract address
3. Verify the contract source code

## Using Hardhat (Alternative)

### Install Dependencies
```bash
npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox
```

### Create hardhat.config.js
```javascript
require("@nomicfoundation/hardhat-toolbox");

module.exports = {
  solidity: "0.8.20",
  networks: {
    qie: {
      url: "https://rpc1mainnet.qie.digital/",
      accounts: ["YOUR_PRIVATE_KEY"] // Use .env file in production!
    }
  }
};
```

### Compile
```bash
npx hardhat compile
```

### Deploy
```bash
npx hardhat run scripts/deploy.js --network qie
```

## Important Notes

⚠️ **SECURITY WARNING**: 
- Never commit private keys to git
- Use `.env` file and add it to `.gitignore`
- Remove private key from deployment scripts after use

## QIE Token Address

You need the QIE token contract address. Options:
1. Use existing QIE ERC20 token address (if available)
2. Deploy `QIEToken.sol` first as a wrapped QIE token
3. Check QIE Network documentation for official token address


