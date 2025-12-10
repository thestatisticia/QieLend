import { ethers } from 'ethers';
import QieLendNativeABI from '../contracts/QieLendNativeABI.json';
import PointsCalculatorABI from '../contracts/PointsCalculatorABI.json';

// Contract address - set via environment variable or update here
const CONTRACT_ADDRESS = import.meta.env.VITE_QIE_CONTRACT_ADDRESS || '0x0000000000000000000000000000000000000000';
const POINTS_CONTRACT_ADDRESS = import.meta.env.VITE_POINTS_CALCULATOR_ADDRESS || '0x0000000000000000000000000000000000000000';

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
