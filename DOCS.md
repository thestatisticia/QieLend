# QieLend Documentation

## 📚 Table of Contents
1. [Getting Started](#getting-started)
2. [Features](#features)
3. [Usage Guide](#usage-guide)
4. [Technical Documentation](#technical-documentation)
5. [FAQ](#faq)

---

## 🚀 Getting Started

### What is QieLend?
QieLend is a decentralized money market protocol built on the QIE Network that allows users to supply and borrow native QIE tokens. Earn interest on supplied assets and borrow against your collateral.

### Prerequisites
- A Web3 wallet (MetaMask or QIE Wallet)
- QIE tokens in your wallet
- Connection to QIE Mainnet (Chain ID: 1990)

### Connecting Your Wallet
1. Click "Connect Wallet" in the top navigation
2. Choose MetaMask or QIE Wallet
3. Approve the connection request
4. Ensure you're connected to QIE Mainnet

---

## ✨ Features

### Core Features
- **Supply Assets**: Deposit QIE tokens to earn interest
- **Borrow Assets**: Borrow QIE against your supplied collateral (70% LTV)
- **Rewards System**: Earn APR rewards on supplied assets
- **Points System**: Earn points based on supply and borrow activity (borrowing has 2x weight)
- **Health Factor**: Monitor your borrowing health (liquidatable if < 1.0)
- **Collateral Management**: Enable/disable collateral for borrowing
- **Portfolio Tracking**: View your total assets, borrows, and net value

### Key Metrics
- **Supply APR**: ~4-5% (varies with utilization)
- **Borrow APR**: ~7-9% (varies with utilization)
- **Collateral Factor**: 70% LTV
- **Liquidation Threshold**: 80%

---

## 📖 Usage Guide

### Supplying Assets
1. Navigate to Dashboard
2. Click "Supply" tab
3. Enter the amount of QIE you want to supply
4. Click "Deposit"
5. Approve the transaction in your wallet
6. Your supplied balance will update immediately

**Note**: Supplied assets start earning rewards immediately based on the current Supply APR.

### Withdrawing Assets
1. Click "Withdraw" tab
2. Enter the amount to withdraw
3. Click "Withdraw"
4. Approve the transaction

**Limitations**: 
- Cannot withdraw more than your supplied balance
- If you have borrowed assets, you must maintain sufficient collateral (70% LTV)

### Borrowing Assets
1. Ensure you have supplied assets and enabled collateral
2. Click "Borrow" tab
3. Enter the amount to borrow (up to 70% of your supplied collateral)
4. Click "Borrow"
5. Approve the transaction

**Important**: 
- You can borrow up to 70% of your supplied collateral value
- Borrowing increases your health factor risk
- You'll pay interest on borrowed amounts

### Repaying Borrowed Assets
1. Click "Repay" tab
2. Enter the amount to repay
3. Click "Repay"
4. Approve the transaction

**Note**: You can repay more than you borrowed (excess goes to protocol reserves).

### Claiming Rewards
1. Navigate to Dashboard
2. Scroll to the Rewards section
3. Click "Claim" when rewards are available
4. Approve the transaction

**Note**: Rewards accumulate in real-time based on your supplied assets and the current Supply APR.

### Managing Collateral
1. Go to Dashboard → Supplies section
2. Toggle the "Collateral" switch
3. Approve the transaction

**Important**: 
- You cannot disable collateral if you have outstanding borrows
- Collateral must be enabled to borrow assets

### Viewing Portfolio
1. Click "Portfolio" in the navigation
2. View your:
   - Wallet balance
   - Supplied assets
   - Borrowed assets
   - Total value
   - Available to borrow
   - Net APR
   - Health factor
   - Points

### Points System
- Points are calculated based on your supply and borrow activity
- **Formula**: `(Supply × 1) + (Borrow × 2)`
- Borrowing carries 2x weight
- Points update in real-time after transactions
- View your points on the Portfolio page or Points Leaderboard

---

## 🔧 Technical Documentation

### Contract Addresses
- **QieLend Contract**: Set via `VITE_QIE_CONTRACT_ADDRESS` environment variable
- **Points Calculator**: Set via `VITE_POINTS_CALCULATOR_ADDRESS` environment variable

### Contract ABIs
- `src/contracts/QieLendNativeABI.json` - Main lending contract ABI
- `src/contracts/PointsCalculatorABI.json` - Points calculation contract ABI

### Key Contract Functions

#### QieLendNative Contract
- `supplyNative()` - Supply native QIE tokens (payable)
- `withdraw(uint256 amount)` - Withdraw supplied tokens
- `borrow(uint256 amount)` - Borrow QIE tokens
- `repay()` - Repay borrowed tokens (payable)
- `setCollateralEnabled(bool enabled)` - Enable/disable collateral
- `claimRewards()` - Claim accumulated rewards
- `getSupplyBalance(address user)` - Get user's supply balance
- `getBorrowBalance(address user)` - Get user's borrow balance
- `getAvailableToBorrow(address user)` - Get available borrowing capacity
- `getHealthFactor(address user)` - Get user's health factor
- `getSupplyAPY()` - Get current supply APY
- `getBorrowAPY()` - Get current borrow APY
- `getAccruedRewards(address user)` - Get user's accrued rewards

#### PointsCalculator Contract
- `calculatePoints(uint256 supplied, uint256 borrowed)` - Calculate user points
  - Formula: `(supplied × 1e18) + (borrowed × 2e18)`

### Contract Parameters
- **COLLATERAL_FACTOR**: 7000 (70% LTV)
- **LIQUIDATION_THRESHOLD**: 8000 (80%)
- **RESERVE_FACTOR**: 4000 (40% of interest to reserves)
- **BASE_RATE**: 200 (2% basis points)
- **KINK_UTILIZATION**: 8000 (80%)
- **MULTIPLIER**: 800 (8% basis points)
- **JUMP_MULTIPLIER**: 2000 (20% basis points)

### Rate Model
The protocol uses a kinked interest rate model:
- **Below 80% utilization**: Linear rate increase
- **Above 80% utilization**: Jump multiplier applies
- **Supply APR**: Borrow APR × (1 - Reserve Factor)
- **Borrow APR**: Calculated based on utilization rate

### Health Factor Calculation
```
Health Factor = (Collateral Value × Liquidation Threshold) / Borrow Balance
```
- **Safe**: > 1.5
- **At Risk**: 1.0 - 1.5
- **Liquidatable**: < 1.0

### Network Configuration
- **Network**: QIE Mainnet
- **Chain ID**: 1990 (0x7C6)
- **RPC URL**: https://rpc1mainnet.qie.digital/
- **Explorer**: https://mainnet.qie.digital/
- **Currency**: QIE (native token)

---

## ❓ FAQ

### General Questions

**Q: What is the minimum amount I can supply or borrow?**
A: There's no minimum, but you need enough QIE to cover gas fees.

**Q: How often do rewards update?**
A: Rewards accumulate in real-time and update every 10 seconds in the UI.

**Q: Can I withdraw all my supplied assets?**
A: Only if you have no outstanding borrows. If you've borrowed, you must maintain sufficient collateral.

**Q: What happens if my health factor drops below 1.0?**
A: Your position becomes liquidatable. Liquidators can repay your debt and seize your collateral.

**Q: How are points calculated?**
A: Points = (Supplied QIE × 1) + (Borrowed QIE × 2). Borrowing has 2x weight.

**Q: Do points reset?**
A: No, points accumulate over time based on your supply and borrow positions.

### Technical Questions

**Q: What wallet should I use?**
A: MetaMask or QIE Wallet. Both are supported.

**Q: Why can't I borrow even though I have supplied assets?**
A: Make sure collateral is enabled in the Supplies section.

**Q: Why is my available to borrow less than 70% of my supply?**
A: If you already have borrows, your available capacity is reduced by your current borrow balance.

**Q: How do I check my transaction on the blockchain?**
A: Use the QIE Explorer: https://mainnet.qie.digital/ and search for your transaction hash.

**Q: What happens to excess repayments?**
A: Any amount repaid above your borrow balance goes to protocol reserves.

### Troubleshooting

**Q: Transaction keeps failing**
A: Check that you have enough QIE for gas fees and that you're on QIE Mainnet.

**Q: Wallet won't connect**
A: Make sure your wallet extension is installed and unlocked. Try refreshing the page.

**Q: Points not updating**
A: Points update after transactions. Wait a few seconds and refresh the page.

**Q: Rewards showing zero**
A: Rewards only accumulate if you have supplied assets. Check your supply balance.

---

## 📞 Support

For issues or questions:
- Check the FAQ above
- Review contract documentation in `contracts/README.md`
- Visit our GitHub repository

---

**Last Updated**: 2025

