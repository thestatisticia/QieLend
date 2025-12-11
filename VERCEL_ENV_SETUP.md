# Vercel Environment Variables Setup

## Required Environment Variables

To deploy QieLend on Vercel, you need to set the following environment variables in your Vercel project settings:

### 1. Contract Addresses

```
VITE_QIE_CONTRACT_ADDRESS=0xYourContractAddressHere
VITE_POINTS_CALCULATOR_ADDRESS=0xYourPointsCalculatorAddressHere
```

### 2. Oracle Addresses (Optional - already hardcoded with fallbacks)

```
VITE_QIE_ORACLE_ADDRESS=0x3Bc617cF3A4Bb77003e4c556B87b13D556903D17
VITE_SOL_ORACLE_ADDRESS=0xe86999c8e6C8eeF71bebd35286bCa674E0AD7b21
VITE_ETH_ORACLE_ADDRESS=0x4bb7012Fbc79fE4Ae9B664228977b442b385500d
VITE_BTC_ORACLE_ADDRESS=0x9E596d809a20A272c788726f592c0d1629755440
VITE_XRP_ORACLE_ADDRESS=0x804582B1f8Fea73919e7c737115009f668f97528
VITE_BNB_ORACLE_ADDRESS=0x775A56117Fdb8b31877E75Ceeb68C96765b031e6
VITE_XAUT_ORACLE_ADDRESS=0x9aD0199a67588ee293187d26bA1BE61cb07A214c
```

## How to Set Environment Variables in Vercel

### Method 1: Via Vercel Dashboard (Recommended)

1. Go to your Vercel project dashboard: https://vercel.com/dashboard
2. Select your QieLend project
3. Go to **Settings** → **Environment Variables**
4. Add each variable:
   - **Name**: `VITE_QIE_CONTRACT_ADDRESS`
   - **Value**: Your contract address (e.g., `0x...`)
   - **Environment**: Select all (Production, Preview, Development)
5. Click **Save**
6. Repeat for all required variables

### Method 2: Via Vercel CLI

```bash
# Install Vercel CLI if not already installed
npm i -g vercel

# Login to Vercel
vercel login

# Set environment variables
vercel env add VITE_QIE_CONTRACT_ADDRESS
vercel env add VITE_POINTS_CALCULATOR_ADDRESS

# Pull environment variables to verify
vercel env pull
```

### Method 3: Via Vercel API

You can also set environment variables programmatically using the Vercel API.

## Important Notes

1. **After adding environment variables, you MUST redeploy:**
   - Go to **Deployments** tab
   - Click the **⋯** menu on the latest deployment
   - Select **Redeploy**
   - Or push a new commit to trigger a new deployment

2. **Environment variables are case-sensitive:**
   - Use exactly: `VITE_QIE_CONTRACT_ADDRESS`
   - Not: `VITE_QIE_CONTRACT_address` or `vite_qie_contract_address`

3. **VITE_ prefix is required:**
   - Vite only exposes environment variables that start with `VITE_`
   - This is a security feature to prevent accidental exposure of sensitive data

4. **Check your local .env file:**
   - Copy the values from your local `.env` file
   - Make sure they match exactly

## Verifying Environment Variables

After deployment, you can verify the environment variables are set by:

1. Checking the browser console for the contract address log
2. Looking at the network tab to see if contract calls are being made
3. Checking if the overview page shows real data instead of dummy data

## Troubleshooting

### Issue: Contract address shows as `0x0000000000000000000000000000000000000000`

**Solution:**
- Verify the environment variable is set in Vercel
- Make sure it's set for the correct environment (Production/Preview/Development)
- Redeploy after adding the variable
- Check the variable name is exactly `VITE_QIE_CONTRACT_ADDRESS`

### Issue: Can't supply QIE on Vercel but works locally

**Solution:**
- This is likely because `VITE_QIE_CONTRACT_ADDRESS` is not set
- Set the environment variable and redeploy

### Issue: Protocol overview shows dummy stats on Vercel

**Solution:**
- Ensure `VITE_QIE_CONTRACT_ADDRESS` is set correctly
- The app will fetch protocol totals even without a connected wallet
- Check browser console for any errors

## Getting Your Contract Address

If you don't know your contract address:

1. Check your local `.env` file
2. Check the deployment transaction on QIE Explorer
3. Check your deployment script output
4. Look in your deployment documentation

