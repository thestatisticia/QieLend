// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title QieLend
 * @notice A single-asset lending and borrowing protocol for QIE Network
 * @dev Monolithic contract handling all lending, borrowing, rewards, and liquidation logic
 */
contract QieLend {
    // ============ State Variables ============
    
    // QIE Token Interface (ERC20)
    IERC20 public immutable qieToken;
    
    // Protocol Parameters
    uint256 public constant COLLATERAL_FACTOR = 70; // 70% of collateral can be borrowed (in basis points)
    uint256 public constant LIQUIDATION_THRESHOLD = 80; // 80% threshold for liquidation (in basis points)
    uint256 public constant LIQUIDATION_BONUS = 5; // 5% bonus for liquidators (in basis points)
    uint256 public constant RESERVE_FACTOR = 12; // 12% of interest goes to reserves (in basis points)
    uint256 public constant SECONDS_PER_YEAR = 365 days;
    
    // Interest Rate Model Parameters
    uint256 public constant BASE_RATE = 2; // 2% base rate (in basis points)
    uint256 public constant KINK_UTILIZATION = 80; // 80% kink utilization (in basis points)
    uint256 public constant MULTIPLIER = 15; // 15% multiplier above kink (in basis points)
    uint256 public constant JUMP_MULTIPLIER = 100; // 100% jump multiplier above kink (in basis points)
    
    // Protocol State
    uint256 public totalSupply; // Total QIE supplied to protocol
    uint256 public totalBorrow; // Total QIE borrowed from protocol
    uint256 public totalReserves; // Protocol reserves
    uint256 public lastUpdateTime; // Last interest accrual timestamp
    
    // Exchange Rate (1e18 = 1:1, increases as interest accrues)
    uint256 public exchangeRate = 1e18;
    
    // User Account State
    struct UserAccount {
        uint256 supplyBalance; // User's supplied QIE (in underlying tokens)
        uint256 borrowBalance; // User's borrowed QIE (in underlying tokens)
        uint256 supplyIndex; // Exchange rate index when user last supplied
        uint256 borrowIndex; // Borrow index when user last borrowed
        bool collateralEnabled; // Whether user's supply is used as collateral
        uint256 accruedRewards; // Accumulated APR rewards (in QIE)
        uint256 lastRewardUpdate; // Last time rewards were updated
    }
    
    mapping(address => UserAccount) public accounts;
    
    // Global Interest Index (increases as interest accrues)
    uint256 public supplyIndex = 1e18;
    uint256 public borrowIndex = 1e18;
    
    // Events
    event Supply(address indexed user, uint256 amount, uint256 newBalance);
    event Withdraw(address indexed user, uint256 amount, uint256 newBalance);
    event Borrow(address indexed user, uint256 amount, uint256 newBalance);
    event Repay(address indexed user, uint256 amount, uint256 newBalance);
    event CollateralToggled(address indexed user, bool enabled);
    event RewardsClaimed(address indexed user, uint256 amount);
    event Liquidate(address indexed liquidator, address indexed borrower, uint256 repayAmount, uint256 seizeAmount);
    event InterestAccrued(uint256 newSupplyIndex, uint256 newBorrowIndex, uint256 totalReserves);
    
    // ============ Constructor ============
    
    constructor(address _qieToken) {
        require(_qieToken != address(0), "Invalid token address");
        qieToken = IERC20(_qieToken);
        lastUpdateTime = block.timestamp;
    }
    
    // ============ Modifiers ============
    
    modifier updateInterest() {
        _accrueInterest();
        _;
    }
    
    modifier updateUserRewards(address user) {
        _updateUserRewards(user);
        _;
    }
    
    // ============ Core Functions ============
    
    /**
     * @notice Supply QIE tokens to the protocol
     * @param amount Amount of QIE to supply
     */
    function supply(uint256 amount) external updateInterest updateUserRewards(msg.sender) {
        require(amount > 0, "Amount must be greater than 0");
        
        // Transfer QIE from user to contract
        require(qieToken.transferFrom(msg.sender, address(this), amount), "Transfer failed");
        
        // Update user's supply balance (using exchange rate)
        UserAccount storage account = accounts[msg.sender];
        uint256 supplyAmount = (amount * 1e18) / exchangeRate;
        account.supplyBalance += supplyAmount;
        account.supplyIndex = supplyIndex;
        
        // Update protocol totals
        totalSupply += amount;
        
        emit Supply(msg.sender, amount, account.supplyBalance);
    }
    
    /**
     * @notice Withdraw supplied QIE tokens
     * @param amount Amount of QIE to withdraw (in underlying tokens)
     */
    function withdraw(uint256 amount) external updateInterest updateUserRewards(msg.sender) {
        require(amount > 0, "Amount must be greater than 0");
        
        UserAccount storage account = accounts[msg.sender];
        
        // Calculate user's actual supply balance (with accrued interest)
        uint256 userSupplyBalance = (account.supplyBalance * exchangeRate) / 1e18;
        require(userSupplyBalance >= amount, "Insufficient balance");
        
        // Check if withdrawal would affect borrowing capacity
        if (account.collateralEnabled && account.borrowBalance > 0) {
            uint256 newSupplyBalance = userSupplyBalance - amount;
            uint256 maxBorrow = (newSupplyBalance * COLLATERAL_FACTOR) / 10000;
            require(account.borrowBalance <= maxBorrow, "Cannot withdraw: would exceed collateral");
        }
        
        // Update user's supply balance
        uint256 withdrawAmount = (amount * 1e18) / exchangeRate;
        account.supplyBalance -= withdrawAmount;
        account.supplyIndex = supplyIndex;
        
        // Update protocol totals
        totalSupply -= amount;
        
        // Transfer QIE to user
        require(qieToken.transfer(msg.sender, amount), "Transfer failed");
        
        emit Withdraw(msg.sender, amount, account.supplyBalance);
    }
    
    /**
     * @notice Borrow QIE tokens from the protocol
     * @param amount Amount of QIE to borrow
     */
    function borrow(uint256 amount) external updateInterest updateUserRewards(msg.sender) {
        require(amount > 0, "Amount must be greater than 0");
        
        UserAccount storage account = accounts[msg.sender];
        require(account.collateralEnabled, "Collateral must be enabled to borrow");
        
        // Calculate user's actual supply balance (with accrued interest)
        uint256 userSupplyBalance = (account.supplyBalance * exchangeRate) / 1e18;
        
        // Calculate maximum borrowable amount
        uint256 maxBorrow = (userSupplyBalance * COLLATERAL_FACTOR) / 10000;
        
        // Calculate user's current borrow balance (with accrued interest)
        uint256 userBorrowBalance = (account.borrowBalance * borrowIndex) / account.borrowIndex;
        
        require(userBorrowBalance + amount <= maxBorrow, "Exceeds borrowing capacity");
        require(totalBorrow + amount <= totalSupply, "Insufficient protocol liquidity");
        
        // Update user's borrow balance
        account.borrowBalance += (amount * 1e18) / borrowIndex;
        account.borrowIndex = borrowIndex;
        
        // Update protocol totals
        totalBorrow += amount;
        
        // Transfer QIE to user
        require(qieToken.transfer(msg.sender, amount), "Transfer failed");
        
        emit Borrow(msg.sender, amount, account.borrowBalance);
    }
    
    /**
     * @notice Repay borrowed QIE tokens
     * @param amount Amount of QIE to repay
     */
    function repay(uint256 amount) external updateInterest updateUserRewards(msg.sender) {
        require(amount > 0, "Amount must be greater than 0");
        
        UserAccount storage account = accounts[msg.sender];
        
        // Calculate user's actual borrow balance (with accrued interest)
        uint256 userBorrowBalance = (account.borrowBalance * borrowIndex) / account.borrowIndex;
        
        // If repaying more than owed, only repay what's owed
        uint256 repayAmount = amount > userBorrowBalance ? userBorrowBalance : amount;
        
        // Transfer QIE from user to contract
        require(qieToken.transferFrom(msg.sender, address(this), repayAmount), "Transfer failed");
        
        // Update user's borrow balance
        account.borrowBalance = ((userBorrowBalance - repayAmount) * 1e18) / borrowIndex;
        account.borrowIndex = borrowIndex;
        
        // Update protocol totals
        totalBorrow -= repayAmount;
        
        emit Repay(msg.sender, repayAmount, account.borrowBalance);
    }
    
    /**
     * @notice Toggle collateral on/off for user's supplied assets
     * @param enabled Whether to enable collateral
     */
    function setCollateralEnabled(bool enabled) external updateInterest updateUserRewards(msg.sender) {
        UserAccount storage account = accounts[msg.sender];
        
        // If disabling collateral, check that user has no outstanding borrows
        if (!enabled && account.borrowBalance > 0) {
            uint256 userBorrowBalance = (account.borrowBalance * borrowIndex) / account.borrowIndex;
            require(userBorrowBalance == 0, "Must repay all borrows before disabling collateral");
        }
        
        account.collateralEnabled = enabled;
        
        emit CollateralToggled(msg.sender, enabled);
    }
    
    /**
     * @notice Claim accumulated APR rewards
     */
    function claimRewards() external updateInterest updateUserRewards(msg.sender) {
        UserAccount storage account = accounts[msg.sender];
        uint256 rewardAmount = account.accruedRewards;
        
        require(rewardAmount > 0, "No rewards to claim");
        
        // Reset user's accrued rewards
        account.accruedRewards = 0;
        account.lastRewardUpdate = block.timestamp;
        
        // Transfer rewards from protocol reserves (or mint if needed)
        // For now, we'll use protocol reserves. In production, you might want a separate reward pool
        require(qieToken.transfer(msg.sender, rewardAmount), "Reward transfer failed");
        
        emit RewardsClaimed(msg.sender, rewardAmount);
    }
    
    /**
     * @notice Liquidate an unhealthy position
     * @param borrower Address of the borrower to liquidate
     * @param repayAmount Amount of QIE to repay on behalf of borrower
     */
    function liquidate(address borrower, uint256 repayAmount) external updateInterest {
        require(borrower != msg.sender, "Cannot liquidate yourself");
        require(repayAmount > 0, "Repay amount must be greater than 0");
        
        UserAccount storage borrowerAccount = accounts[borrower];
        require(borrowerAccount.collateralEnabled, "Borrower has no collateral");
        
        // Calculate borrower's actual balances
        uint256 borrowerSupplyBalance = (borrowerAccount.supplyBalance * exchangeRate) / 1e18;
        uint256 borrowerBorrowBalance = (borrowerAccount.borrowBalance * borrowIndex) / borrowerAccount.borrowIndex;
        
        // Calculate health factor
        uint256 healthFactor = _calculateHealthFactor(borrowerSupplyBalance, borrowerBorrowBalance);
        require(healthFactor < 1e18, "Borrower is not liquidatable"); // Health factor < 1.0
        
        // Calculate liquidation bonus
        uint256 liquidationBonus = (repayAmount * LIQUIDATION_BONUS) / 10000;
        uint256 seizeAmount = repayAmount + liquidationBonus;
        
        require(seizeAmount <= borrowerSupplyBalance, "Insufficient collateral to seize");
        
        // Transfer repay amount from liquidator
        require(qieToken.transferFrom(msg.sender, address(this), repayAmount), "Repay transfer failed");
        
        // Update borrower's borrow balance
        borrowerAccount.borrowBalance = ((borrowerBorrowBalance - repayAmount) * 1e18) / borrowIndex;
        borrowerAccount.borrowIndex = borrowIndex;
        
        // Update borrower's supply balance (seize collateral)
        uint256 seizeAmountScaled = (seizeAmount * 1e18) / exchangeRate;
        borrowerAccount.supplyBalance -= seizeAmountScaled;
        borrowerAccount.supplyIndex = supplyIndex;
        
        // Update protocol totals
        totalBorrow -= repayAmount;
        totalSupply -= seizeAmount;
        
        // Transfer seized collateral to liquidator
        require(qieToken.transfer(msg.sender, seizeAmount), "Seize transfer failed");
        
        emit Liquidate(msg.sender, borrower, repayAmount, seizeAmount);
    }
    
    // ============ View Functions ============
    
    /**
     * @notice Get user's supply balance (in underlying QIE)
     */
    function getSupplyBalance(address user) external view returns (uint256) {
        UserAccount memory account = accounts[user];
        return (account.supplyBalance * exchangeRate) / 1e18;
    }
    
    /**
     * @notice Get user's borrow balance (in underlying QIE)
     */
    function getBorrowBalance(address user) external view returns (uint256) {
        UserAccount memory account = accounts[user];
        return (account.borrowBalance * borrowIndex) / account.borrowIndex;
    }
    
    /**
     * @notice Get user's available borrowing capacity
     */
    function getAvailableToBorrow(address user) external view returns (uint256) {
        UserAccount memory account = accounts[user];
        if (!account.collateralEnabled) return 0;
        
        uint256 userSupplyBalance = (account.supplyBalance * exchangeRate) / 1e18;
        uint256 maxBorrow = (userSupplyBalance * COLLATERAL_FACTOR) / 10000;
        uint256 userBorrowBalance = (account.borrowBalance * borrowIndex) / account.borrowIndex;
        
        return maxBorrow > userBorrowBalance ? maxBorrow - userBorrowBalance : 0;
    }
    
    /**
     * @notice Get user's health factor (1e18 = 1.0, < 1e18 = liquidatable)
     */
    function getHealthFactor(address user) external view returns (uint256) {
        UserAccount memory account = accounts[user];
        if (!account.collateralEnabled || account.borrowBalance == 0) {
            return type(uint256).max; // Infinite health factor if no borrows
        }
        
        uint256 userSupplyBalance = (account.supplyBalance * exchangeRate) / 1e18;
        uint256 userBorrowBalance = (account.borrowBalance * borrowIndex) / account.borrowIndex;
        
        return _calculateHealthFactor(userSupplyBalance, userBorrowBalance);
    }
    
    /**
     * @notice Get current supply APY (in basis points)
     */
    function getSupplyAPY() external view returns (uint256) {
        if (totalSupply == 0) return BASE_RATE;
        
        uint256 utilization = (totalBorrow * 10000) / totalSupply;
        uint256 borrowRate = _calculateBorrowRate(utilization);
        uint256 supplyRate = (borrowRate * (10000 - RESERVE_FACTOR)) / 10000;
        
        return supplyRate;
    }
    
    /**
     * @notice Get current borrow APY (in basis points)
     */
    function getBorrowAPY() external view returns (uint256) {
        if (totalSupply == 0) return BASE_RATE;
        
        uint256 utilization = (totalBorrow * 10000) / totalSupply;
        return _calculateBorrowRate(utilization);
    }
    
    /**
     * @notice Get user's accrued rewards
     */
    function getAccruedRewards(address user) external view returns (uint256) {
        UserAccount memory account = accounts[user];
        if (account.supplyBalance == 0) return account.accruedRewards;
        
        // Calculate rewards since last update
        uint256 timeElapsed = block.timestamp - account.lastRewardUpdate;
        if (timeElapsed == 0) return account.accruedRewards;
        
        uint256 userSupplyBalance = (account.supplyBalance * exchangeRate) / 1e18;
        uint256 supplyAPY = this.getSupplyAPY();
        uint256 supplyRate = supplyAPY * 1e18 / 10000; // Convert to per-second rate
        
        uint256 rewardsPerSecond = (userSupplyBalance * supplyRate) / SECONDS_PER_YEAR;
        uint256 newRewards = rewardsPerSecond * timeElapsed;
        
        return account.accruedRewards + newRewards;
    }
    
    // ============ Internal Functions ============
    
    /**
     * @notice Accrue interest to all suppliers and borrowers
     */
    function _accrueInterest() internal {
        uint256 timeElapsed = block.timestamp - lastUpdateTime;
        if (timeElapsed == 0 || totalSupply == 0) {
            lastUpdateTime = block.timestamp;
            return;
        }
        
        // Calculate utilization rate
        uint256 utilization = totalBorrow > 0 ? (totalBorrow * 1e18) / totalSupply : 0;
        
        // Calculate borrow rate (per second)
        uint256 borrowRate = _calculateBorrowRate((utilization * 10000) / 1e18);
        uint256 borrowRatePerSecond = (borrowRate * 1e18) / (10000 * SECONDS_PER_YEAR);
        
        // Calculate interest accrued
        uint256 interestAccrued = (totalBorrow * borrowRatePerSecond * timeElapsed) / 1e18;
        
        // Calculate reserve amount (portion of interest goes to reserves)
        uint256 reserveAmount = (interestAccrued * RESERVE_FACTOR) / 10000;
        uint256 supplyInterest = interestAccrued - reserveAmount;
        
        // Update exchange rate (increases as interest accrues to suppliers)
        if (totalSupply > 0) {
            exchangeRate += (supplyInterest * 1e18) / totalSupply;
        }
        
        // Update borrow index (increases as interest accrues to protocol)
        if (totalBorrow > 0) {
            borrowIndex += (interestAccrued * 1e18) / totalBorrow;
        }
        
        // Update supply index (same as exchange rate for tracking)
        supplyIndex = exchangeRate;
        
        // Update reserves
        totalReserves += reserveAmount;
        totalBorrow += interestAccrued;
        totalSupply += supplyInterest;
        
        lastUpdateTime = block.timestamp;
        
        emit InterestAccrued(supplyIndex, borrowIndex, totalReserves);
    }
    
    /**
     * @notice Update user's accrued rewards
     */
    function _updateUserRewards(address user) internal {
        UserAccount storage account = accounts[user];
        
        if (account.supplyBalance == 0) {
            account.lastRewardUpdate = block.timestamp;
            return;
        }
        
        uint256 timeElapsed = block.timestamp - account.lastRewardUpdate;
        if (timeElapsed == 0) return;
        
        // Calculate user's supply balance
        uint256 userSupplyBalance = (account.supplyBalance * exchangeRate) / 1e18;
        
        // Get current supply APY
        uint256 utilization = totalBorrow > 0 ? (totalBorrow * 10000) / totalSupply : 0;
        uint256 borrowRate = _calculateBorrowRate(utilization);
        uint256 supplyRate = (borrowRate * (10000 - RESERVE_FACTOR)) / 10000;
        
        // Calculate rewards per second
        uint256 supplyRatePerSecond = (supplyRate * 1e18) / (10000 * SECONDS_PER_YEAR);
        uint256 rewardsPerSecond = (userSupplyBalance * supplyRatePerSecond) / 1e18;
        
        // Accumulate rewards
        account.accruedRewards += rewardsPerSecond * timeElapsed;
        account.lastRewardUpdate = block.timestamp;
    }
    
    /**
     * @notice Calculate borrow rate based on utilization (in basis points)
     */
    function _calculateBorrowRate(uint256 utilization) internal pure returns (uint256) {
        if (utilization <= KINK_UTILIZATION) {
            // Below kink: linear increase
            return BASE_RATE + (utilization * MULTIPLIER) / KINK_UTILIZATION;
        } else {
            // Above kink: steeper increase
            uint256 excessUtilization = utilization - KINK_UTILIZATION;
            uint256 baseRate = BASE_RATE + MULTIPLIER;
            return baseRate + (excessUtilization * JUMP_MULTIPLIER) / (10000 - KINK_UTILIZATION);
        }
    }
    
    /**
     * @notice Calculate health factor (1e18 = 1.0)
     */
    function _calculateHealthFactor(uint256 supplyBalance, uint256 borrowBalance) internal pure returns (uint256) {
        if (borrowBalance == 0) return type(uint256).max;
        
        uint256 collateralValue = (supplyBalance * LIQUIDATION_THRESHOLD) / 10000;
        return (collateralValue * 1e18) / borrowBalance;
    }
}

// ============ Interfaces ============

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
}


