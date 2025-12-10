import { ethers } from 'ethers';
import QieLendNativeABI from '../contracts/QieLendNativeABI.json';
import PointsCalculatorABI from '../contracts/PointsCalculatorABI.json';

// Contract address - set via environment variable or update here
const CONTRACT_ADDRESS = import.meta.env.VITE_QIE_CONTRACT_ADDRESS || '0x0000000000000000000000000000000000000000';
const POINTS_CONTRACT_ADDRESS = import.meta.env.VITE_POINTS_CALCULATOR_ADDRESS || '0x0000000000000000000000000000000000000000';

// QIE Oracle contract address (can be overridden via environment variable)
// Uses Chainlink AggregatorV3Interface
// QIE/USDT price feed address on QIE Mainnet
const QIE_ORACLE_ADDRESS = import.meta.env.VITE_QIE_ORACLE_ADDRESS || '0x3Bc617cF3A4Bb77003e4c556B87b13D556903D17';
const QIE_ORACLE_ABI = [
  {
    inputs: [],
    name: 'latestRoundData',
    outputs: [
      { internalType: 'uint80', name: 'roundId', type: 'uint80' },
      { internalType: 'int256', name: 'answer', type: 'int256' },
      { internalType: 'uint256', name: 'startedAt', type: 'uint256' },
      { internalType: 'uint256', name: 'updatedAt', type: 'uint256' },
      { internalType: 'uint80', name: 'answeredInRound', type: 'uint80' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint80', name: '_roundId', type: 'uint80' }],
    name: 'getRoundData',
    outputs: [
      { internalType: 'uint80', name: 'roundId', type: 'uint80' },
      { internalType: 'int256', name: 'answer', type: 'int256' },
      { internalType: 'uint256', name: 'startedAt', type: 'uint256' },
      { internalType: 'uint256', name: 'updatedAt', type: 'uint256' },
      { internalType: 'uint80', name: 'answeredInRound', type: 'uint80' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'decimals',
    outputs: [{ internalType: 'uint8', name: '', type: 'uint8' }],
    stateMutability: 'view',
    type: 'function',
  },
];

const ensureEthersProvider = (provider) => {
  if (!provider) throw new Error('Provider is required');

  // Already an ethers v6 provider with getSigner
  if (typeof provider.getSigner === 'function') return provider;

  // EIP-1193 provider (MetaMask / QIE) with request
  if (provider.request) return new ethers.BrowserProvider(provider);

  // Some providers may nest the EIP-1193 object under `.provider`
  if (provider.provider?.request) return new ethers.BrowserProvider(provider.provider);

  throw new Error('Invalid provider');
};

// Helper to get raw provider from BrowserProvider (for QIE Wallet)
const getRawProvider = (provider) => {
  if (provider && provider._getConnection) {
    const connection = provider._getConnection();
    if (connection && connection.provider) {
      return connection.provider;
    }
  }
  return null;
};

/**
 * Get contract instance with signer (for transactions)
 * @param {Object} provider - The ethers provider
 * @param {string} [accountAddress] - Optional account address (required for QIE Wallet)
 */
export async function getContractWithSigner(provider, accountAddress = null) {
  const ethersProvider = ensureEthersProvider(provider);

  // For QIE Wallet: create JsonRpcSigner directly (synchronous, no validation/prompts)
  if (accountAddress) {
    // Create signer synchronously - no async calls, no validation, no prompts
    const signer = new ethers.JsonRpcSigner(ethersProvider, accountAddress);
    return new ethers.Contract(CONTRACT_ADDRESS, QieLendNativeABI, signer);
  }

  // For MetaMask: try default signer (no prompts if already connected)
  // Don't validate with getAddress() - that can cause prompts
  const signer = await ethersProvider.getSigner();
  return new ethers.Contract(CONTRACT_ADDRESS, QieLendNativeABI, signer);
}

/**
 * Get contract instance without signer (for read-only)
 */
export function getContract(provider) {
  const ethersProvider = ensureEthersProvider(provider);
  return new ethers.Contract(CONTRACT_ADDRESS, QieLendNativeABI, ethersProvider);
}

/**
 * Get points calculator (read-only)
 */
export function getPointsContract(provider) {
  const ethersProvider = ensureEthersProvider(provider);
  if (POINTS_CONTRACT_ADDRESS === '0x0000000000000000000000000000000000000000') {
    throw new Error('Points contract address not configured');
  }
  return new ethers.Contract(POINTS_CONTRACT_ADDRESS, PointsCalculatorABI, ethersProvider);
}

/**
 * Supply QIE tokens to the protocol
 */
export async function supply(provider, amount, accountAddress = null) {
  const contract = await getContractWithSigner(provider, accountAddress);
  const tx = await contract.supplyNative({ value: ethers.parseEther(amount.toString()) });
  return await tx.wait();
}

/**
 * Withdraw supplied QIE tokens
 */
export async function withdraw(provider, amount, accountAddress = null) {
  const contract = await getContractWithSigner(provider, accountAddress);
  const tx = await contract.withdraw(ethers.parseEther(amount.toString()));
  return await tx.wait();
}

/**
 * Borrow QIE tokens
 */
export async function borrow(provider, amount, accountAddress = null) {
  const contract = await getContractWithSigner(provider, accountAddress);
  const tx = await contract.borrow(ethers.parseEther(amount.toString()));
  return await tx.wait();
}

/**
 * Repay borrowed QIE tokens
 */
export async function repay(provider, amount, accountAddress = null) {
  const contract = await getContractWithSigner(provider, accountAddress);
  const tx = await contract.repay({ value: ethers.parseEther(amount.toString()) });
  return await tx.wait();
}

/**
 * Toggle collateral on/off
 */
export async function setCollateralEnabled(provider, enabled, accountAddress = null) {
  const contract = await getContractWithSigner(provider, accountAddress);
  const tx = await contract.setCollateralEnabled(enabled);
  return await tx.wait();
}

/**
 * Claim accumulated rewards
 */
export async function claimRewards(provider, accountAddress = null) {
  const contract = await getContractWithSigner(provider, accountAddress);
  const tx = await contract.claimRewards();
  return await tx.wait();
}

/**
 * Get user's supply balance
 */
export async function getSupplyBalance(provider, userAddress) {
  const contract = getContract(provider);
  const balance = await contract.getSupplyBalance(userAddress);
  return parseFloat(ethers.formatEther(balance));
}

/**
 * Get user's borrow balance
 */
export async function getBorrowBalance(provider, userAddress) {
  const contract = getContract(provider);
  const balance = await contract.getBorrowBalance(userAddress);
  return parseFloat(ethers.formatEther(balance));
}

/**
 * Get available to borrow
 */
export async function getAvailableToBorrow(provider, userAddress) {
  const contract = getContract(provider);
  const amount = await contract.getAvailableToBorrow(userAddress);
  return parseFloat(ethers.formatEther(amount));
}

/**
 * Get health factor
 */
export async function getHealthFactor(provider, userAddress) {
  const contract = getContract(provider);
  const hf = await contract.getHealthFactor(userAddress);
  return parseFloat(ethers.formatEther(hf));
}

/**
 * Get supply APY (in percentage)
 */
export async function getSupplyAPY(provider) {
  const contract = getContract(provider);
  const apyBasisPoints = await contract.getSupplyAPY();
  return parseFloat(apyBasisPoints) / 100; // Convert basis points to percentage
}

/**
 * Get borrow APY (in percentage)
 */
export async function getBorrowAPY(provider) {
  const contract = getContract(provider);
  const apyBasisPoints = await contract.getBorrowAPY();
  return parseFloat(apyBasisPoints) / 100; // Convert basis points to percentage
}

/**
 * Get accrued rewards
 */
export async function getAccruedRewards(provider, userAddress) {
  const contract = getContract(provider);
  const rewards = await contract.getAccruedRewards(userAddress);
  return parseFloat(ethers.formatEther(rewards));
}

/**
 * Get protocol totals
 */
export async function getProtocolTotals(provider) {
  const contract = getContract(provider);
  const [totalSupply, totalBorrow, totalReserves] = await Promise.all([
    contract.totalSupply(),
    contract.totalBorrow(),
    contract.totalReserves()
  ]);
  
  return {
    supply: parseFloat(ethers.formatEther(totalSupply)),
    borrow: parseFloat(ethers.formatEther(totalBorrow)),
    reserves: parseFloat(ethers.formatEther(totalReserves))
  };
}

/**
 * Get user account info
 */
export async function getUserAccount(provider, userAddress) {
  const contract = getContract(provider);
  const account = await contract.accounts(userAddress);
  
  return {
    supplyBalance: parseFloat(ethers.formatEther(account.supplyBalance)),
    borrowBalance: parseFloat(ethers.formatEther(account.borrowBalance)),
    collateralEnabled: account.collateralEnabled,
    accruedRewards: parseFloat(ethers.formatEther(account.accruedRewards))
  };
}

/**
 * Calculate points via PointsCalculator contract
 */
export async function calculatePoints(provider, supplied, borrowed) {
  const contract = getPointsContract(provider);
  const suppliedWei = ethers.parseEther(supplied.toString());
  const borrowedWei = ethers.parseEther(borrowed.toString());
  const points = await contract.calculatePoints(suppliedWei, borrowedWei);
  return parseFloat(ethers.formatEther(points));
}

/**
 * Get QIE price from QIE Oracle (Chainlink AggregatorV3Interface compatible)
 * Returns price in USD
 * @param {Object} provider - Optional ethers provider. If not provided, creates a JsonRpcProvider
 */
export async function getQIEPrice(provider = null) {
  try {
    let ethersProvider;
    
    if (provider) {
      // Use provided provider (ensure it's a valid ethers provider)
      try {
        ethersProvider = ensureEthersProvider(provider);
      } catch (e) {
        // If provider validation fails, create a new one
        ethersProvider = new ethers.JsonRpcProvider('https://rpc1mainnet.qie.digital/');
      }
    } else {
      // Create a new provider for Oracle calls (no wallet needed)
      ethersProvider = new ethers.JsonRpcProvider('https://rpc1mainnet.qie.digital/');
    }
    
    // First, check if contract has code at this address
    const code = await ethersProvider.getCode(QIE_ORACLE_ADDRESS);
    if (code === '0x' || code === '0x0') {
      console.warn('QIE Oracle contract not found at address:', QIE_ORACLE_ADDRESS);
      console.warn('Please verify you are using the correct QIE/USDT price feed address, not the BTC Oracle address');
      return 0.13; // Fallback
    }
    
    const oracleContract = new ethers.Contract(QIE_ORACLE_ADDRESS, QIE_ORACLE_ABI, ethersProvider);
    
    // Call latestRoundData() - returns tuple: (roundId, answer, startedAt, updatedAt, answeredInRound)
    const roundData = await oracleContract.latestRoundData();
    
    // Extract values from tuple
    const roundId = roundData[0];
    const answer = roundData[1]; // int256
    const startedAt = roundData[2];
    const updatedAt = roundData[3];
    const answeredInRound = roundData[4];
    
    // Validate answer is not zero
    if (!answer || answer.toString() === '0') {
      console.warn('QIE Oracle returned zero answer');
      return 0.13; // Fallback
    }
    
    // Check if data is stale (older than 1 hour = 3600 seconds)
    const currentTime = Math.floor(Date.now() / 1000);
    const stalenessThreshold = 3600; // 1 hour in seconds
    if (updatedAt && currentTime - Number(updatedAt.toString()) > stalenessThreshold) {
      console.warn('QIE Oracle data is stale (older than 1 hour)');
      // Still use it but log warning
    }
    
    // Get decimals from the oracle contract (default to 8 if call fails)
    let decimals = 8; // Chainlink standard
    try {
      const decimalsRaw = await oracleContract.decimals();
      decimals = Number(decimalsRaw.toString());
      console.log(`Oracle decimals: ${decimals}`);
    } catch (err) {
      console.log('Could not fetch decimals from Oracle, using default 8');
    }
    
    // Convert int256 answer to positive number
    // Handle negative values (shouldn't happen for price, but handle gracefully)
    const answerBigInt = BigInt(answer.toString());
    const answerAbs = answerBigInt < 0n ? -answerBigInt : answerBigInt;
    const answerString = answerAbs.toString();
    
    console.log(`Oracle raw answer: ${answerString}, decimals: ${decimals}`);
    
    // Convert to decimal price
    const price = Number(answerAbs) / Math.pow(10, decimals);
    
    console.log(`Calculated price before validation: $${price}`);
    
    // If price seems too high, try different decimal interpretations
    // Sometimes oracles return prices in different formats
    let finalPrice = price;
    if (price > 1000) {
      // Try with 18 decimals (native token format)
      const price18 = Number(answerAbs) / Math.pow(10, 18);
      if (price18 >= 0.001 && price18 <= 1000) {
        console.log(`Price with 18 decimals is reasonable: $${price18}`);
        finalPrice = price18;
      } else {
        // Try with 0 decimals (maybe it's already in USD format)
        const price0 = Number(answerAbs);
        if (price0 >= 0.001 && price0 <= 1000) {
          console.log(`Price with 0 decimals is reasonable: $${price0}`);
          finalPrice = price0;
        } else {
          // Try dividing by 1e6 (maybe it's in micro-dollars or something)
          const price6 = Number(answerAbs) / 1e6;
          if (price6 >= 0.001 && price6 <= 1000) {
            console.log(`Price divided by 1e6 is reasonable: $${price6}`);
            finalPrice = price6;
          }
        }
      }
    }
    
    // Validate price is reasonable (between 0.001 and 1000 USD)
    if (finalPrice < 0.001 || finalPrice > 1000) {
      console.warn(`QIE Oracle returned unreasonable price: ${finalPrice} USD (raw: ${answerString}, decimals: ${decimals})`);
      return 0.13; // Fallback
    }
    
    console.log(`QIE Price from Oracle: $${finalPrice.toFixed(4)} (decimals: ${decimals}, updated: ${new Date(Number(updatedAt.toString()) * 1000).toISOString()})`);
    return finalPrice;
    
  } catch (error) {
    console.error('Error fetching QIE price from Oracle:', error);
    // Return fallback price
    return 0.13;
  }
}
