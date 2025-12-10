# 🚀 Quick Deployment Guide

## Deploy Contract Using Remix IDE (Easiest Method)

### Step 1: Prepare
1. Open https://remix.ethereum.org/
2. Create new file: `QieLend.sol`
3. Copy content from `contracts/QieLend.sol`

### Step 2: Compile
1. Select Solidity compiler **0.8.20**
2. Click "Compile QieLend.sol"
3. Check for errors

### Step 3: Deploy
1. Go to "Deploy & Run Transactions"
2. Select "Injected Provider - MetaMask"
3. **Switch MetaMask to QIE Mainnet** (Chain ID: 1990)
   - If not added, add network:
     - Network Name: QIE Mainnet
     - RPC URL: https://rpc1mainnet.qie.digital/
     - Chain ID: 1990
     - Currency: QIE
4. In constructor, enter QIE token address (see note below)
5. Click "Deploy"
6. **Copy the contract address**

### Step 4: Update Frontend
Create `.env` file in project root:
```
VITE_QIE_CONTRACT_ADDRESS=0xYourContractAddressHere
```

Or update `src/App.jsx` line 18 directly.

### Step 5: Remove Private Key
⚠️ **IMPORTANT**: After deployment, remove the private key from:
- `scripts/deploy-simple.js` (line 7)
- Any other files where it appears

## QIE Token Address

You need the QIE ERC20 token address. Options:

1. **Check QIE docs** for official token address
2. **Deploy QIEToken.sol first** (if needed):
   - Deploy `contracts/QIEToken.sol` in Remix
   - Use that address in QieLend constructor
3. **Use zero address temporarily** (for testing only)

## After Deployment

1. ✅ Contract deployed
2. ✅ Contract address saved
3. ✅ Private key removed
4. ✅ Frontend updated
5. 🧪 Test the integration!

## Need Help?

- Check `DEPLOYMENT.md` for detailed instructions
- Check `contracts/README.md` for contract documentation


