# QieLend Smart Contract Documentation

## Overview

QieLend is a single-asset lending and borrowing protocol built for the QIE Network. It allows users to supply QIE tokens to earn interest (APR rewards) and borrow QIE against their supplied collateral.

## Contract Architecture

### Core Components

1. **Interest Rate Model**: Dynamic interest rates based on utilization
2. **Collateral System**: Users can enable/disable collateral for borrowing
3. **Rewards System**: Real-time APR rewards accumulation
4. **Liquidation Mechanism**: Automatic liquidation of unhealthy positions
5. **Reserve System**: Protocol reserves from interest

## Key Parameters

```solidity
COLLATERAL_FACTOR = 70%        // 70% of collateral can be borrowed
LIQUIDATION_THRESHOLD = 80%    // 80% threshold triggers liquidation
LIQUIDATION_BONUS = 5%          // 5% bonus for liquidators
RESERVE_FACTOR = 12%           // 12% of interest goes to reserves
BASE_RATE = 2%                 // 2% base interest rate
KINK_UTILIZATION = 80%         // 80% utilization kink point
```

## How It Works

### 1. Supply Mechanism

**Function**: `supply(uint256 amount)`

- Users deposit QIE tokens into the protocol
- Tokens are tracked using an exchange rate system
- As interest accrues, the exchange rate increases
- Users earn APR rewards based on their supplied balance

**Example Flow**:
1. User supplies 1000 QIE
2. Exchange rate = 1.0 (1:1 ratio)
3. User receives 1000 supply tokens internally
4. Over time, exchange rate increases to 1.042 (4.2% APR)
5. User can withdraw 1042 QIE (1000 × 1.042)

### 2. Borrow Mechanism

**Function**: `borrow(uint256 amount)`

- Users can borrow up to 70% of their collateral value
- Requires collateral to be enabled
- Interest accrues on borrowed amount
- Borrowed amount increases over time due to interest

**Example Flow**:
1. User has 1000 QIE supplied as collateral
2. Max borrow = 700 QIE (70% of 1000)
3. User borrows 500 QIE
4. Interest accrues at borrow APY rate
5. User must repay 500 QIE + accrued interest

### 3. Interest Rate Model

**Function**: `_calculateBorrowRate(uint256 utilization)`

The protocol uses a kinked interest rate model:

- **Below 80% utilization**: Linear increase from 2% to ~14%
- **Above 80% utilization**: Steeper increase (jump multiplier)

**Formula**:
```
If utilization ≤ 80%:
  rate = 2% + (utilization × 15%) / 80%
  
If utilization > 80%:
  rate = 17% + ((utilization - 80%) × 100%) / 20%
```

**Supply Rate**:
```
supply_rate = borrow_rate × (100% - 12% reserve_factor)
```

### 4. Rewards System

**Function**: `claimRewards()`

- APR rewards accumulate in real-time (per second)
- Rewards are calculated based on:
  - User's supplied balance
  - Current supply APY
  - Time elapsed since last update

**Reward Calculation**:
```
rewards_per_second = (supplied_balance × supply_APY) / (365 × 24 × 60 × 60)
accrued_rewards = rewards_per_second × time_elapsed
```

### 5. Health Factor

**Function**: `getHealthFactor(address user)`

Health factor determines liquidation risk:

```
health_factor = (collateral_value × 80%) / borrow_balance
```

- **Health Factor > 1.0**: Safe
- **Health Factor < 1.0**: Liquidatable
- **Health Factor = 1.0**: At liquidation threshold

**Example**:
- User has 1000 QIE supplied (collateral)
- User has 700 QIE borrowed
- Collateral value at 80% threshold = 800 QIE
- Health Factor = 800 / 700 = 1.14 (Safe)

### 6. Liquidation

**Function**: `liquidate(address borrower, uint256 repayAmount)`

When health factor < 1.0:
- Anyone can liquidate the position
- Liquidator repays borrower's debt
- Liquidator receives collateral + 5% bonus
- Borrower loses collateral but debt is cleared

**Example**:
- Borrower owes 800 QIE
- Borrower has 1000 QIE collateral
- Liquidator repays 800 QIE
- Liquidator receives 840 QIE (800 + 5% bonus)
- Borrower loses 840 QIE but debt is cleared

### 7. Collateral Management

**Function**: `setCollateralEnabled(bool enabled)`

- Users can enable/disable collateral
- When disabled, users cannot borrow
- Must repay all borrows before disabling
- Disabling collateral doesn't affect supply rewards

## State Variables

### Protocol State
- `totalSupply`: Total QIE supplied to protocol
- `totalBorrow`: Total QIE borrowed from protocol
- `totalReserves`: Protocol reserves (from interest)
- `exchangeRate`: Current exchange rate (increases with interest)
- `supplyIndex`: Supply interest index
- `borrowIndex`: Borrow interest index

### User State (per address)
- `supplyBalance`: User's supplied amount (in internal tokens)
- `borrowBalance`: User's borrowed amount (in internal tokens)
- `supplyIndex`: Exchange rate when user last supplied
- `borrowIndex`: Borrow index when user last borrowed
- `collateralEnabled`: Whether supply is used as collateral
- `accruedRewards`: Accumulated APR rewards
- `lastRewardUpdate`: Last time rewards were updated

## Key Functions

### Core Functions

| Function | Description |
|----------|-------------|
| `supply(uint256 amount)` | Supply QIE tokens to earn interest |
| `withdraw(uint256 amount)` | Withdraw supplied QIE tokens |
| `borrow(uint256 amount)` | Borrow QIE against collateral |
| `repay(uint256 amount)` | Repay borrowed QIE + interest |
| `setCollateralEnabled(bool)` | Enable/disable collateral |
| `claimRewards()` | Claim accumulated APR rewards |
| `liquidate(address, uint256)` | Liquidate unhealthy position |

### View Functions

| Function | Description |
|----------|-------------|
| `getSupplyBalance(address)` | Get user's supply balance (in QIE) |
| `getBorrowBalance(address)` | Get user's borrow balance (in QIE) |
| `getAvailableToBorrow(address)` | Get user's borrowing capacity |
| `getHealthFactor(address)` | Get user's health factor |
| `getSupplyAPY()` | Get current supply APY (basis points) |
| `getBorrowAPY()` | Get current borrow APY (basis points) |
| `getAccruedRewards(address)` | Get user's accrued rewards |

## Interest Accrual

Interest accrues continuously using compound interest:

1. **Every transaction** triggers `_accrueInterest()`
2. **Time elapsed** since last update is calculated
3. **Borrow rate** is calculated based on utilization
4. **Interest** is added to total borrow
5. **Exchange rate** increases (suppliers earn interest)
6. **Reserves** receive 12% of interest

## Security Features

1. **Reentrancy Protection**: No external calls before state updates
2. **Overflow Protection**: Solidity 0.8.20 has built-in overflow checks
3. **Access Control**: No admin functions (fully decentralized)
4. **Collateral Checks**: Cannot withdraw if it would make position unhealthy
5. **Liquidation Protection**: Only liquidatable positions can be liquidated

## Events

All major actions emit events for off-chain tracking:

- `Supply`: When user supplies tokens
- `Withdraw`: When user withdraws tokens
- `Borrow`: When user borrows tokens
- `Repay`: When user repays tokens
- `CollateralToggled`: When collateral is enabled/disabled
- `RewardsClaimed`: When user claims rewards
- `Liquidate`: When position is liquidated
- `InterestAccrued`: When interest is accrued

## Usage Examples

### Supply and Earn

```solidity
// 1. Approve QIE tokens
qieToken.approve(qieLendAddress, 1000e18);

// 2. Supply tokens
qieLend.supply(1000e18);

// 3. Enable collateral (optional, for borrowing)
qieLend.setCollateralEnabled(true);

// 4. Check rewards over time
uint256 rewards = qieLend.getAccruedRewards(userAddress);

// 5. Claim rewards
qieLend.claimRewards();
```

### Borrow Against Collateral

```solidity
// 1. Ensure collateral is enabled
qieLend.setCollateralEnabled(true);

// 2. Check available to borrow
uint256 available = qieLend.getAvailableToBorrow(userAddress);

// 3. Borrow tokens
qieLend.borrow(500e18);

// 4. Monitor health factor
uint256 healthFactor = qieLend.getHealthFactor(userAddress);

// 5. Repay when ready
qieLend.repay(500e18);
```

### Liquidate Unhealthy Position

```solidity
// 1. Check if position is liquidatable
uint256 healthFactor = qieLend.getHealthFactor(borrowerAddress);
require(healthFactor < 1e18, "Not liquidatable");

// 2. Approve tokens for repayment
qieToken.approve(qieLendAddress, repayAmount);

// 3. Liquidate
qieLend.liquidate(borrowerAddress, repayAmount);
```

## Deployment

1. Deploy QIE token contract (if not already deployed)
2. Deploy QieLend contract with QIE token address
3. Users approve QIE tokens to QieLend contract
4. Start supplying and borrowing!

## Important Notes

- All amounts are in QIE (18 decimals)
- Interest accrues continuously (compound interest)
- Health factor must be monitored to avoid liquidation
- Collateral must be enabled to borrow
- Rewards accumulate in real-time and can be claimed anytime
- Liquidation bonus incentivizes liquidators to maintain protocol health


