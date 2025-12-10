// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title PointsCalculator
 * @notice Minimal helper to compute user points from supplied and borrowed amounts.
 *         Borrowing is weighted more heavily than supplying.
 */
contract PointsCalculator {
    // Weights expressed in 1e18 fixed-point to allow fractional tuning later.
    uint256 public constant SUPPLY_WEIGHT = 1e18;       // 1x weight
    uint256 public constant BORROW_WEIGHT = 2e18;       // 2x weight (borrow counts double)

    /**
     * @notice Calculate points for a user given supplied and borrowed amounts.
     * @param supplied Amount of assets supplied (in underlying units).
     * @param borrowed Amount of assets borrowed (in underlying units).
     * @return points Weighted points total.
     */
    function calculatePoints(uint256 supplied, uint256 borrowed) external pure returns (uint256 points) {
        // points = supply * 1 + borrow * 2 (scaled by 1e18 weights)
        unchecked {
            points =
                (supplied * SUPPLY_WEIGHT / 1e18) +
                (borrowed * BORROW_WEIGHT / 1e18);
        }
    }
}

