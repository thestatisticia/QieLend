// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title QieLendNative
 * @notice Native-QIE lending/borrowing with on-chain interest and rewards.
 *         This is a minimal adaptation of the prior ERC20 version, using native QIE.
 */
contract QieLendNative {
    uint256 public constant COLLATERAL_FACTOR = 7000; // 70% LTV (basis points: 7000/10000 = 0.7)
    uint256 public constant LIQUIDATION_THRESHOLD = 8000; // 80% (basis points: 8000/10000 = 0.8)
    uint256 public constant LIQUIDATION_BONUS = 5; // 5% (basis points)
    uint256 public constant RESERVE_FACTOR = 4000; // 40% of interest to reserves (basis points: 4000/10000 = 0.4)
    uint256 public constant SECONDS_PER_YEAR = 365 days;

    // Rate model (basis points)
    uint256 public constant BASE_RATE = 200;          // 2.00%
    uint256 public constant KINK_UTILIZATION = 8000;  // 80%
    uint256 public constant MULTIPLIER = 800;         // up to +8% at kink
    uint256 public constant JUMP_MULTIPLIER = 2000;   // up to +20% in the jump

    uint256 public totalSupply; // native QIE supplied
    uint256 public totalBorrow; // native QIE borrowed
    uint256 public totalReserves;
    uint256 public lastUpdateTime;

    uint256 public exchangeRate = 1e18;
    uint256 public supplyIndex = 1e18;
    uint256 public borrowIndex = 1e18;

    struct UserAccount {
        uint256 supplyBalance; // scaled by exchangeRate
        uint256 borrowBalance; // scaled by borrowIndex
        uint256 supplyIndex;
        uint256 borrowIndex;
        bool collateralEnabled;
        uint256 accruedRewards;
        uint256 lastRewardUpdate;
    }

    mapping(address => UserAccount) public accounts;

    event Supply(address indexed user, uint256 amount, uint256 newBalance);
    event Withdraw(address indexed user, uint256 amount, uint256 newBalance);
    event Borrow(address indexed user, uint256 amount, uint256 newBalance);
    event Repay(address indexed user, uint256 amount, uint256 newBalance);
    event CollateralToggled(address indexed user, bool enabled);
    event RewardsClaimed(address indexed user, uint256 amount);
    event Liquidate(address indexed liquidator, address indexed borrower, uint256 repayAmount, uint256 seizeAmount);
    event InterestAccrued(uint256 newSupplyIndex, uint256 newBorrowIndex, uint256 totalReserves);

    error InsufficientBalance();
    error InvalidAmount();
    error CollateralDisabled();
    error ExceedsBorrowCapacity();
    error InsufficientLiquidity();

    modifier updateInterest() {
        _accrueInterest();
        _;
    }

    modifier updateUserRewards(address user) {
        _updateUserRewards(user);
        _;
    }

    receive() external payable {}

    function supplyNative() external payable updateInterest updateUserRewards(msg.sender) {
        uint256 amount = msg.value;
        if (amount == 0) revert InvalidAmount();

        UserAccount storage account = accounts[msg.sender];
        uint256 supplyAmount = (amount * 1e18) / exchangeRate;
        account.supplyBalance += supplyAmount;
        account.supplyIndex = supplyIndex;

        totalSupply += amount;

        emit Supply(msg.sender, amount, account.supplyBalance);
    }

    function withdraw(uint256 amount) external updateInterest updateUserRewards(msg.sender) {
        if (amount == 0) revert InvalidAmount();
        UserAccount storage account = accounts[msg.sender];

        uint256 userSupplyBalance = (account.supplyBalance * exchangeRate) / 1e18;
        if (userSupplyBalance < amount) revert InsufficientBalance();

        if (account.collateralEnabled && account.borrowBalance > 0) {
            uint256 newSupplyBalance = userSupplyBalance - amount;
            uint256 maxBorrow = (newSupplyBalance * COLLATERAL_FACTOR) / 10000;
            uint256 borrowIdx = account.borrowIndex == 0 ? borrowIndex : account.borrowIndex;
            uint256 currentBorrow = (account.borrowBalance * borrowIndex) / borrowIdx;
            if (currentBorrow > maxBorrow) revert CollateralDisabled();
        }

        uint256 withdrawAmount = (amount * 1e18) / exchangeRate;
        account.supplyBalance -= withdrawAmount;
        account.supplyIndex = supplyIndex;

        totalSupply -= amount;

        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        require(ok, "Native transfer failed");

        emit Withdraw(msg.sender, amount, account.supplyBalance);
    }

    function borrow(uint256 amount) external updateInterest updateUserRewards(msg.sender) {
        if (amount == 0) revert InvalidAmount();

        UserAccount storage account = accounts[msg.sender];
        if (!account.collateralEnabled) revert CollateralDisabled();

        uint256 userSupplyBalance = (account.supplyBalance * exchangeRate) / 1e18;
        uint256 maxBorrow = (userSupplyBalance * COLLATERAL_FACTOR) / 10000;
        uint256 borrowIdx = account.borrowIndex == 0 ? borrowIndex : account.borrowIndex;
        uint256 userBorrowBalance = account.borrowBalance == 0 ? 0 : (account.borrowBalance * borrowIndex) / borrowIdx;

        if (userBorrowBalance + amount > maxBorrow) revert ExceedsBorrowCapacity();
        if (totalBorrow + amount > totalSupply) revert InsufficientLiquidity();

        account.borrowBalance += (amount * 1e18) / borrowIndex;
        account.borrowIndex = borrowIndex;

        totalBorrow += amount;

        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        require(ok, "Native transfer failed");

        emit Borrow(msg.sender, amount, account.borrowBalance);
    }

    function repay() external payable updateInterest updateUserRewards(msg.sender) {
        uint256 amount = msg.value;
        if (amount == 0) revert InvalidAmount();

        UserAccount storage account = accounts[msg.sender];
        uint256 borrowIdx = account.borrowIndex == 0 ? borrowIndex : account.borrowIndex;
        uint256 userBorrowBalance = account.borrowBalance == 0 ? 0 : (account.borrowBalance * borrowIndex) / borrowIdx;

        uint256 repayAmount = amount > userBorrowBalance ? userBorrowBalance : amount;
        account.borrowBalance = ((userBorrowBalance - repayAmount) * 1e18) / borrowIndex;
        account.borrowIndex = borrowIndex;

        totalBorrow -= repayAmount;

        // Excess stays as protocol reserves for simplicity
        if (amount > repayAmount) {
            totalReserves += (amount - repayAmount);
        }

        emit Repay(msg.sender, repayAmount, account.borrowBalance);
    }

    function setCollateralEnabled(bool enabled) external updateInterest updateUserRewards(msg.sender) {
        UserAccount storage account = accounts[msg.sender];
        if (!enabled && account.borrowBalance > 0) {
            uint256 borrowIdx = account.borrowIndex == 0 ? borrowIndex : account.borrowIndex;
            uint256 userBorrowBalance = account.borrowBalance == 0 ? 0 : (account.borrowBalance * borrowIndex) / borrowIdx;
            require(userBorrowBalance == 0, "Repay before disabling collateral");
        }
        account.collateralEnabled = enabled;
        emit CollateralToggled(msg.sender, enabled);
    }

    function claimRewards() external updateInterest updateUserRewards(msg.sender) {
        UserAccount storage account = accounts[msg.sender];
        uint256 rewardAmount = account.accruedRewards;
        require(rewardAmount > 0, "No rewards");

        account.accruedRewards = 0;
        account.lastRewardUpdate = block.timestamp;

        if (rewardAmount > address(this).balance) {
          rewardAmount = address(this).balance;
        }

        (bool ok, ) = payable(msg.sender).call{value: rewardAmount}("");
        require(ok, "Reward transfer failed");

        emit RewardsClaimed(msg.sender, rewardAmount);
    }

    function liquidate(address borrower) external payable updateInterest {
        uint256 repayAmount = msg.value;
        if (repayAmount == 0) revert InvalidAmount();
        if (borrower == msg.sender) revert();

        UserAccount storage borrowerAccount = accounts[borrower];
        require(borrowerAccount.collateralEnabled, "No collateral");

        uint256 borrowerSupplyBalance = (borrowerAccount.supplyBalance * exchangeRate) / 1e18;
        uint256 borrowerBorrowBalance = (borrowerAccount.borrowBalance * borrowIndex) / borrowerAccount.borrowIndex;

        uint256 healthFactor = _calculateHealthFactor(borrowerSupplyBalance, borrowerBorrowBalance);
        require(healthFactor < 1e18, "Not liquidatable");

        uint256 repay = repayAmount > borrowerBorrowBalance ? borrowerBorrowBalance : repayAmount;
        uint256 liquidationBonus = (repay * LIQUIDATION_BONUS) / 10000;
        uint256 seizeAmount = repay + liquidationBonus;
        require(seizeAmount <= borrowerSupplyBalance, "Insufficient collateral");

        borrowerAccount.borrowBalance = ((borrowerBorrowBalance - repay) * 1e18) / borrowIndex;
        borrowerAccount.borrowIndex = borrowIndex;

        uint256 seizeAmountScaled = (seizeAmount * 1e18) / exchangeRate;
        borrowerAccount.supplyBalance -= seizeAmountScaled;
        borrowerAccount.supplyIndex = supplyIndex;

        totalBorrow -= repay;
        totalSupply -= seizeAmount;

        (bool ok, ) = payable(msg.sender).call{value: seizeAmount}("");
        require(ok, "Seize transfer failed");

        emit Liquidate(msg.sender, borrower, repay, seizeAmount);
    }

    function getSupplyBalance(address user) external view returns (uint256) {
        UserAccount memory account = accounts[user];
        return (account.supplyBalance * exchangeRate) / 1e18;
    }

    function getBorrowBalance(address user) external view returns (uint256) {
        UserAccount memory account = accounts[user];
        uint256 borrowIdx = account.borrowIndex == 0 ? borrowIndex : account.borrowIndex;
        if (account.borrowBalance == 0) return 0;
        return (account.borrowBalance * borrowIndex) / borrowIdx;
    }

    function getAvailableToBorrow(address user) external view returns (uint256) {
        UserAccount memory account = accounts[user];
        if (!account.collateralEnabled) return 0;
        uint256 userSupplyBalance = (account.supplyBalance * exchangeRate) / 1e18;
        uint256 maxBorrow = (userSupplyBalance * COLLATERAL_FACTOR) / 10000;
        uint256 borrowIdx = account.borrowIndex == 0 ? borrowIndex : account.borrowIndex;
        uint256 userBorrowBalance = account.borrowBalance == 0 ? 0 : (account.borrowBalance * borrowIndex) / borrowIdx;
        return maxBorrow > userBorrowBalance ? maxBorrow - userBorrowBalance : 0;
    }

    function getHealthFactor(address user) external view returns (uint256) {
        UserAccount memory account = accounts[user];
        if (!account.collateralEnabled || account.borrowBalance == 0) {
            return type(uint256).max;
        }
        uint256 userSupplyBalance = (account.supplyBalance * exchangeRate) / 1e18;
        uint256 borrowIdx = account.borrowIndex == 0 ? borrowIndex : account.borrowIndex;
        uint256 userBorrowBalance = account.borrowBalance == 0 ? 0 : (account.borrowBalance * borrowIndex) / borrowIdx;
        return _calculateHealthFactor(userSupplyBalance, userBorrowBalance);
    }

    function getSupplyAPY() external view returns (uint256) {
        if (totalSupply == 0) return BASE_RATE;
        uint256 utilization = (totalBorrow * 10000) / totalSupply;
        uint256 borrowRate = _calculateBorrowRate(utilization);
        uint256 supplyRate = (borrowRate * (10000 - RESERVE_FACTOR)) / 10000;
        return supplyRate;
    }

    function getBorrowAPY() external view returns (uint256) {
        if (totalSupply == 0) return BASE_RATE;
        uint256 utilization = (totalBorrow * 10000) / totalSupply;
        return _calculateBorrowRate(utilization);
    }

    function getAccruedRewards(address user) external view returns (uint256) {
        UserAccount memory account = accounts[user];
        if (account.supplyBalance == 0) return account.accruedRewards;
        uint256 timeElapsed = block.timestamp - account.lastRewardUpdate;
        if (timeElapsed == 0) return account.accruedRewards;
        uint256 userSupplyBalance = (account.supplyBalance * exchangeRate) / 1e18;
        uint256 supplyAPY = this.getSupplyAPY();
        uint256 supplyRate = (supplyAPY * 1e18) / 10000;
        uint256 rewardsPerSecond = (userSupplyBalance * supplyRate) / SECONDS_PER_YEAR;
        uint256 newRewards = rewardsPerSecond * timeElapsed;
        return account.accruedRewards + newRewards;
    }

    function _accrueInterest() internal {
        uint256 timeElapsed = block.timestamp - lastUpdateTime;
        if (timeElapsed == 0 || totalSupply == 0) {
            lastUpdateTime = block.timestamp;
            return;
        }
        uint256 utilization = totalBorrow > 0 ? (totalBorrow * 1e18) / totalSupply : 0;
        uint256 borrowRate = _calculateBorrowRate((utilization * 10000) / 1e18);
        uint256 borrowRatePerSecond = (borrowRate * 1e18) / (10000 * SECONDS_PER_YEAR);
        uint256 interestAccrued = (totalBorrow * borrowRatePerSecond * timeElapsed) / 1e18;
        uint256 reserveAmount = (interestAccrued * RESERVE_FACTOR) / 10000;
        uint256 supplyInterest = interestAccrued - reserveAmount;
        if (totalSupply > 0) {
            exchangeRate += (supplyInterest * 1e18) / totalSupply;
        }
        if (totalBorrow > 0) {
            borrowIndex += (interestAccrued * 1e18) / totalBorrow;
        }
        supplyIndex = exchangeRate;
        totalReserves += reserveAmount;
        totalBorrow += interestAccrued;
        totalSupply += supplyInterest;
        lastUpdateTime = block.timestamp;
        emit InterestAccrued(supplyIndex, borrowIndex, totalReserves);
    }

    function _updateUserRewards(address user) internal {
        UserAccount storage account = accounts[user];
        if (account.supplyBalance == 0) {
            account.lastRewardUpdate = block.timestamp;
            return;
        }
        uint256 timeElapsed = block.timestamp - account.lastRewardUpdate;
        if (timeElapsed == 0) return;
        uint256 userSupplyBalance = (account.supplyBalance * exchangeRate) / 1e18;
        uint256 utilization = totalBorrow > 0 ? (totalBorrow * 10000) / totalSupply : 0;
        uint256 borrowRate = _calculateBorrowRate(utilization);
        uint256 supplyRate = (borrowRate * (10000 - RESERVE_FACTOR)) / 10000;
        uint256 supplyRatePerSecond = (supplyRate * 1e18) / (10000 * SECONDS_PER_YEAR);
        uint256 rewardsPerSecond = (userSupplyBalance * supplyRatePerSecond) / 1e18;
        account.accruedRewards += rewardsPerSecond * timeElapsed;
        account.lastRewardUpdate = block.timestamp;
    }

    function _calculateBorrowRate(uint256 utilization) internal pure returns (uint256) {
        if (utilization <= KINK_UTILIZATION) {
            return BASE_RATE + (utilization * MULTIPLIER) / KINK_UTILIZATION;
        } else {
            uint256 excessUtilization = utilization - KINK_UTILIZATION;
            uint256 baseRate = BASE_RATE + MULTIPLIER;
            return baseRate + (excessUtilization * JUMP_MULTIPLIER) / (10000 - KINK_UTILIZATION);
        }
    }

    function _calculateHealthFactor(uint256 supplyBalance, uint256 borrowBalance) internal pure returns (uint256) {
        if (borrowBalance == 0) return type(uint256).max;
        uint256 collateralValue = (supplyBalance * LIQUIDATION_THRESHOLD) / 10000;
        return (collateralValue * 1e18) / borrowBalance;
    }
}

