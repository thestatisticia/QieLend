import { useEffect, useMemo, useState } from 'react'
import { ethers } from 'ethers'
import './App.css'
import * as contractUtils from './utils/contract.js'

const QIE_NETWORK = {
  chainId: '0x7C6', // 1990 in hex
  chainName: 'QIE Mainnet',
  nativeCurrency: {
    name: 'QIE',
    symbol: 'QIE',
    decimals: 18,
  },
  rpcUrls: ['https://rpc1mainnet.qie.digital/'],
  blockExplorerUrls: ['https://mainnet.qie.digital/'],
}

// Contract address will be added here when deployed
// IMPORTANT: Set VITE_QIE_CONTRACT_ADDRESS in Vercel environment variables
const CONTRACT_ADDRESS = import.meta.env.VITE_QIE_CONTRACT_ADDRESS || '0x0000000000000000000000000000000000000000'
const POINTS_CONTRACT_ADDRESS =
  import.meta.env.VITE_POINTS_CALCULATOR_ADDRESS || '0x0000000000000000000000000000000000000000'

// Log contract address on load to help debug Vercel deployment issues
if (typeof window !== 'undefined') {
  console.log('Contract Address:', CONTRACT_ADDRESS)
  console.log('Points Contract Address:', POINTS_CONTRACT_ADDRESS)
  if (CONTRACT_ADDRESS === '0x0000000000000000000000000000000000000000') {
    console.warn('⚠️ Contract address not configured in environment variables.')
    console.warn('If this is a Vercel deployment, set VITE_QIE_CONTRACT_ADDRESS in Vercel project settings.')
    console.warn('See VERCEL_ENV_SETUP.md for instructions.')
  }
}

const detectMetaMaskProvider = () => {
  if (!window.ethereum) return null
  if (window.ethereum.providers?.length) {
    const mm = window.ethereum.providers.find((p) => p.isMetaMask)
    if (mm) return mm
  }
  return window.ethereum.isMetaMask ? window.ethereum : null
}

const detectQieProvider = () => {
  if (window.qieWallet) return window.qieWallet
  if (!window.ethereum) return null
  if (window.ethereum.providers?.length) {
    const qie = window.ethereum.providers.find((p) => p.isQIEWallet || p.isQieWallet || p.qieWallet)
    if (qie) return qie
  }
  if (window.ethereum.isQIEWallet || window.ethereum.isQieWallet || window.ethereum.qieWallet) {
    return window.ethereum
  }
  return null
}

const mockState = {
  totals: {
    supply: 1_250_000,
    borrow: 740_000,
    supplyApy: 4.2,
    borrowApy: 7.8,
    reserveFactor: 12,
    cap: 2_500_000,
    marketSize: 1_250_000,
  },
  user: {
    supplied: 18_500,
    borrowed: 9_200,
    healthFactor: 1.72,
    targetHealth: 1.5,
    balance: 28_660,
  },
  leaderboard: [
    { address: '0x9f3...b1c', points: 128_420 },
    { address: '0x7a0...a93', points: 117_900 },
    { address: '0xe21...64f', points: 103_110 },
    { address: 'you', points: 12_340 },
  ],
}

const format = (value) =>
  value.toLocaleString(undefined, { maximumFractionDigits: 0 })

const formatAddress = (address) => {
  if (!address) return ''
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

// Leaderboard localStorage helpers
const LEADERBOARD_STORAGE_KEY = 'qielend_leaderboard'

const getLeaderboardFromStorage = () => {
  try {
    const stored = localStorage.getItem(LEADERBOARD_STORAGE_KEY)
    return stored ? JSON.parse(stored) : {}
  } catch (e) {
    console.error('Error reading leaderboard from storage:', e)
    return {}
  }
}

const saveLeaderboardToStorage = (leaderboard) => {
  try {
    localStorage.setItem(LEADERBOARD_STORAGE_KEY, JSON.stringify(leaderboard))
  } catch (e) {
    console.error('Error saving leaderboard to storage:', e)
  }
}

const initializeWalletInLeaderboard = (address) => {
  if (!address) {
    console.warn('initializeWalletInLeaderboard called with no address')
    return
  }
  try {
    const leaderboard = getLeaderboardFromStorage()
    const normalizedAddress = address.toLowerCase()
    if (!leaderboard[normalizedAddress]) {
      leaderboard[normalizedAddress] = { address: normalizedAddress, points: 0 }
      saveLeaderboardToStorage(leaderboard)
      console.log('Initialized wallet in leaderboard with 0 points:', normalizedAddress)
    } else {
      console.log('Wallet already in leaderboard:', normalizedAddress)
    }
  } catch (error) {
    console.error('Error initializing wallet in leaderboard:', error)
  }
}

const updateWalletPoints = (address, points) => {
  if (!address) return
  const leaderboard = getLeaderboardFromStorage()
  const normalizedAddress = address.toLowerCase()
  leaderboard[normalizedAddress] = { address: normalizedAddress, points: Math.max(0, points) }
  saveLeaderboardToStorage(leaderboard)
  console.log('Updated wallet points in leaderboard:', normalizedAddress, points)
}

// Transaction count tracking
const TRANSACTION_COUNT_STORAGE_KEY = 'qielend_transaction_count'

const getTransactionCount = () => {
  try {
    const stored = localStorage.getItem(TRANSACTION_COUNT_STORAGE_KEY)
    return stored ? parseInt(stored, 10) : 0
  } catch (e) {
    console.error('Error reading transaction count from storage:', e)
    return 0
  }
}

const incrementTransactionCount = () => {
  try {
    const currentCount = getTransactionCount()
    const newCount = currentCount + 1
    localStorage.setItem(TRANSACTION_COUNT_STORAGE_KEY, newCount.toString())
    console.log('Transaction count incremented:', newCount)
    return newCount
  } catch (e) {
    console.error('Error incrementing transaction count:', e)
    return getTransactionCount()
  }
}

function App() {
  const [supplyAmount, setSupplyAmount] = useState('')
  const [borrowAmount, setBorrowAmount] = useState('')
  const [withdrawAmount, setWithdrawAmount] = useState('')
  const [repayAmount, setRepayAmount] = useState('')
  const [activeAction, setActiveAction] = useState('supply')
  const [activePage, setActivePage] = useState('landing')
  const [activeTab, setActiveTab] = useState('supply')
  const [points, setPoints] = useState(12_340)
  const [wallet, setWallet] = useState(null)
  const [account, setAccount] = useState(null)
  const [isConnecting, setIsConnecting] = useState(false)
  const [showWalletMenu, setShowWalletMenu] = useState(false)
  const [collateralEnabled, setCollateralEnabled] = useState(true)
  const [rewards, setRewards] = useState(0)
  const [lastRewardUpdate, setLastRewardUpdate] = useState(Date.now())
  const [contractData, setContractData] = useState(null)
  const [isLoadingContract, setIsLoadingContract] = useState(false)
  const [provider, setProvider] = useState(null)
  const [walletBalance, setWalletBalance] = useState(0)
  const [availableToBorrowLive, setAvailableToBorrowLive] = useState(0)
  const [qiePrice, setQiePrice] = useState(0.13) // Default fallback price
  const [landingStats, setLandingStats] = useState({
    marketSize: 0,
    totalVolume: 0,
    totalUsers: 0,
    totalTransactions: 0
  })
  const [tokenPrices, setTokenPrices] = useState({
    SOL: null,
    ETH: null,
    BTC: null,
    XRP: null,
    BNB: null
  })

  // Simple client-side routing to reflect the active page in the URL
  useEffect(() => {
    const path = window.location.pathname.replace('/', '') || 'landing'
    const validPages = ['landing', 'dashboard', 'portfolio', 'overview', 'market', 'points']
    setActivePage(validPages.includes(path) ? path : 'landing')

    const handlePopState = () => {
      const newPath = window.location.pathname.replace('/', '') || 'landing'
      setActivePage(validPages.includes(newPath) ? newPath : 'landing')
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  const navigate = (page) => {
    setActivePage(page)
    const path = page === 'landing' ? '/' : `/${page}`
    window.history.pushState({}, '', path)
  }

  // Removed manual reward ticker; rely on on-chain accrued rewards polling

  useEffect(() => {
    // Check if already connected
    const mm = detectMetaMaskProvider()
    if (mm) {
      mm.request({ method: 'eth_accounts' }).then(async (accounts) => {
        if (accounts.length > 0) {
          try {
            // Verify we're on the correct network
            const existingProvider = new ethers.BrowserProvider(mm)
            const network = await existingProvider.getNetwork()
            
            // If not on QIE Mainnet, try to switch
            if (network.chainId !== BigInt(1990)) {
              console.log('Auto-connect: Not on QIE Mainnet, attempting to switch...')
              try {
                await mm.request({
                  method: 'wallet_switchEthereumChain',
                  params: [{ chainId: QIE_NETWORK.chainId }],
                })
                // Wait for switch
                await new Promise(resolve => setTimeout(resolve, 500))
              } catch (switchError) {
                if (switchError.code === 4902) {
                  await mm.request({
                    method: 'wallet_addEthereumChain',
                    params: [QIE_NETWORK],
                  })
                  await new Promise(resolve => setTimeout(resolve, 500))
                }
              }
            }
            
            // Create provider after network switch
            const provider = new ethers.BrowserProvider(mm)
            setProvider(provider)
            const autoConnectedAccount = accounts[0]
            setAccount(autoConnectedAccount)
            // Initialize wallet in leaderboard if not already present
            initializeWalletInLeaderboard(autoConnectedAccount)
          setWallet('metamask')
            
            // Fetch data after auto-connect
            if (CONTRACT_ADDRESS !== '0x0000000000000000000000000000000000000000') {
              setTimeout(() => {
                fetchContractData()
                fetchWalletBalance()
              }, 1000)
            }
          } catch (error) {
            console.error('Error during auto-connect:', error)
          }
        }
      })
    }
  }, [])

  // Fetch contract data when account is connected, or fetch protocol totals for overview
  useEffect(() => {
    if (account && provider && CONTRACT_ADDRESS !== '0x0000000000000000000000000000000000000000') {
      fetchContractData()
    } else if (CONTRACT_ADDRESS !== '0x0000000000000000000000000000000000000000') {
      // Even without account, fetch protocol totals for overview page
      const fetchProtocolTotals = async () => {
        try {
          const rpcProvider = new ethers.JsonRpcProvider('https://rpc1mainnet.qie.digital/')
          const protocolTotals = await contractUtils.getProtocolTotals(rpcProvider)
          const [supplyAPY, borrowAPY] = await Promise.all([
            contractUtils.getSupplyAPY(rpcProvider).catch(() => 0),
            contractUtils.getBorrowAPY(rpcProvider).catch(() => 0),
          ])
          
          setContractData(prev => ({
            ...prev,
            totals: {
              supply: protocolTotals.supply || 0,
              borrow: protocolTotals.borrow || 0,
              supplyApy: supplyAPY || 0,
              borrowApy: borrowAPY || 0,
              reserveFactor: protocolTotals.reserveFactor || 0,
              cap: protocolTotals.cap || 0,
              marketSize: protocolTotals.supply || 0,
            }
          }))
        } catch (error) {
          console.error('Error fetching protocol totals for overview:', error)
        }
      }
      fetchProtocolTotals()
    }
  }, [account, provider])

  const fetchContractData = async () => {
    if (!account || !provider || CONTRACT_ADDRESS === '0x0000000000000000000000000000000000000000') return
    
    setIsLoadingContract(true)
    try {
      // Verify network before fetching data
      try {
        const network = await provider.getNetwork()
        console.log('Fetching contract data on network:', network, 'for account:', account)
        if (network.chainId !== BigInt(1990)) {
          console.warn('Warning: Not on QIE Mainnet (Chain ID 1990). Current:', network.chainId.toString())
        }
      } catch (netErr) {
        console.error('Error checking network:', netErr)
      }
      
      // Fetch user account first to avoid divide-by-zero paths for empty accounts
      const userAccount = await contractUtils.getUserAccount(provider, account)

      const [protocolTotals, supplyAPY, borrowAPY] = await Promise.all([
        contractUtils.getProtocolTotals(provider),
        contractUtils.getSupplyAPY(provider),
        contractUtils.getBorrowAPY(provider),
      ])

      let availableToBorrow = 0
      let healthFactor = 1.5
      let accruedRewards = 0

      // Get actual balances that account for exchangeRate and borrowIndex
      // These are the real balances, not the raw struct values
      let actualSupplyBalance = 0
      let actualBorrowBalance = 0
      
      try {
        const balances = await Promise.all([
          contractUtils.getSupplyBalance(provider, account),
          contractUtils.getBorrowBalance(provider, account)
        ])
        actualSupplyBalance = balances[0] || 0
        actualBorrowBalance = balances[1] || 0
      } catch (e) {
        console.error('Error fetching actual balances, using raw values', e)
        // Fallback to raw values if view functions fail
        actualSupplyBalance = userAccount.supplyBalance || 0
        actualBorrowBalance = userAccount.borrowBalance || 0
      }

      const hasPositions = actualSupplyBalance > 0 || actualBorrowBalance > 0
      const hasSupplied = actualSupplyBalance > 0
      const protocolHasSupply = (protocolTotals.supply || 0) > 0

      // Only call contract functions that might divide by zero if we have valid positions
      // and protocol has supply to avoid DIVIDE_BY_ZERO panics
      if (hasPositions && protocolHasSupply) {
        try {
          healthFactor = await contractUtils.getHealthFactor(provider, account)
        } catch (e) {
          console.error('getHealthFactor failed, defaulting to 1.5', e)
          healthFactor = 1.5
        }
        try {
          accruedRewards = await contractUtils.getAccruedRewards(provider, account)
        } catch (e) {
          console.error('getAccruedRewards failed, defaulting to 0', e)
          accruedRewards = 0
        }
      }

      // Use contract's getAvailableToBorrow to get exact calculation (matches borrow function logic)
      if (hasSupplied && userAccount.collateralEnabled && protocolHasSupply) {
        try {
          availableToBorrow = await contractUtils.getAvailableToBorrow(provider, account)
        } catch (e) {
          console.error('Error fetching availableToBorrow from contract, calculating client-side', e)
          // Fallback to client-side calculation if contract call fails
          const COLLATERAL_FACTOR = 0.7 // 70% LTV
          const maxBorrow = actualSupplyBalance * COLLATERAL_FACTOR
          availableToBorrow = Math.max(0, maxBorrow - actualBorrowBalance)
        }
      } else {
        availableToBorrow = 0
      }

      // Set defaults if no positions
      if (!hasPositions) {
        availableToBorrow = 0
        accruedRewards = 0
        healthFactor = 1.5
      }

      let calculatedPoints = 0
      if (POINTS_CONTRACT_ADDRESS !== '0x0000000000000000000000000000000000000000') {
        try {
          // Always recalculate points with latest balances
          calculatedPoints = await contractUtils.calculatePoints(
            provider,
            actualSupplyBalance,
            actualBorrowBalance
          )
          console.log('Points calculated in fetchContractData:', calculatedPoints, 'Supply:', actualSupplyBalance, 'Borrow:', actualBorrowBalance)
        } catch (err) {
          console.error('Error calculating points:', err)
          calculatedPoints = 0
        }
      }
      // If no assets, keep points at zero
      if (actualSupplyBalance === 0 && actualBorrowBalance === 0) {
        calculatedPoints = 0
      }

      setContractData({
        user: {
          supplied: actualSupplyBalance,
          borrowed: actualBorrowBalance,
          healthFactor:
            actualSupplyBalance === 0 && actualBorrowBalance === 0
              ? 1.5
              : healthFactor || 1.5,
          collateralEnabled: userAccount.collateralEnabled,
        },
        totals: {
          supply: protocolTotals.supply || 0,
          borrow: protocolTotals.borrow || 0,
          marketSize: protocolTotals.supply || 0,
          supplyApy: supplyAPY || 4.2,
          borrowApy: borrowAPY || 7.8,
        },
        availableToBorrow: availableToBorrow || 0,
        rewards: accruedRewards || 0,
        points: calculatedPoints,
      })

      setAvailableToBorrowLive(availableToBorrow || 0)
      setCollateralEnabled(userAccount.collateralEnabled)
      setRewards(accruedRewards || 0)
      setPoints(calculatedPoints)
      // Update points in leaderboard immediately
      if (account) {
        updateWalletPoints(account, calculatedPoints)
        console.log('Updated points in leaderboard for', account, ':', calculatedPoints)
      }
      await fetchWalletBalance()
    } catch (error) {
      console.error('Error fetching contract data:', error)
      // Even on error, try to fetch at least protocol totals for overview
      try {
        const rpcProvider = new ethers.JsonRpcProvider('https://rpc1mainnet.qie.digital/')
        if (CONTRACT_ADDRESS !== '0x0000000000000000000000000000000000000000') {
          const protocolTotals = await contractUtils.getProtocolTotals(rpcProvider)
          const [supplyAPY, borrowAPY] = await Promise.all([
            contractUtils.getSupplyAPY(rpcProvider).catch(() => 0),
            contractUtils.getBorrowAPY(rpcProvider).catch(() => 0),
          ])
          
          setContractData(prev => ({
            ...prev,
            totals: {
              supply: protocolTotals.supply || 0,
              borrow: protocolTotals.borrow || 0,
              supplyApy: supplyAPY || 0,
              borrowApy: borrowAPY || 0,
              reserveFactor: protocolTotals.reserveFactor || 0,
              cap: protocolTotals.cap || 0,
              marketSize: protocolTotals.supply || 0,
            }
          }))
        }
      } catch (fallbackError) {
        console.error('Error in fallback contract data fetch:', fallbackError)
      }
    } finally {
      setIsLoadingContract(false)
    }
  }

  // Fetch landing page stats from contract
  useEffect(() => {
    const fetchLandingStats = async () => {
      // Always get leaderboard and transaction count (works even without contract)
      const totalTransactions = getTransactionCount()
      const leaderboard = getLeaderboardFromStorage()
      const totalUsers = Math.max(Object.keys(leaderboard).length, 1)
      
      if (CONTRACT_ADDRESS === '0x0000000000000000000000000000000000000000') {
        console.warn('Contract address not configured:', CONTRACT_ADDRESS)
        setLandingStats({
          marketSize: 0,
          totalVolume: 0,
          totalUsers: totalUsers,
          totalTransactions: totalTransactions
        })
        return
      }
      
      try {
        // Create a provider for contract calls (no wallet needed)
        const rpcProvider = new ethers.JsonRpcProvider('https://rpc1mainnet.qie.digital/')
        console.log('Fetching protocol totals from contract:', CONTRACT_ADDRESS)
        
        // Check if contract has code
        const code = await rpcProvider.getCode(CONTRACT_ADDRESS)
        if (!code || code === '0x' || code === '0x0') {
          console.warn('Contract has no code at address:', CONTRACT_ADDRESS, '- Using fallback stats')
          setLandingStats({
            marketSize: 0,
            totalVolume: 0,
            totalUsers: totalUsers,
            totalTransactions: totalTransactions
          })
          return
        }
        
        const protocolTotals = await contractUtils.getProtocolTotals(rpcProvider)
        console.log('Protocol totals fetched:', protocolTotals)
        
        const marketSize = protocolTotals.supply || 0
        const totalVolume = protocolTotals.borrow || 0
        
        console.log('Setting landing stats:', {
          marketSize,
          totalVolume,
          totalUsers,
          totalTransactions
        })
        
        setLandingStats({
          marketSize: marketSize,
          totalVolume: totalVolume,
          totalUsers: totalUsers,
          totalTransactions: totalTransactions
        })
      } catch (error) {
        console.error('Error fetching landing stats:', error)
        // On error, still show user count and transaction count
        setLandingStats({
          marketSize: 0,
          totalVolume: 0,
          totalUsers: totalUsers,
          totalTransactions: totalTransactions
        })
      }
    }
    
    // Fetch immediately
    fetchLandingStats()
    // Refresh stats every 30 seconds
    const interval = setInterval(fetchLandingStats, 30000)
    return () => clearInterval(interval)
  }, [])

  // Update rewards in real-time
  useEffect(() => {
    if (!account || !provider || CONTRACT_ADDRESS === '0x0000000000000000000000000000000000000000') return
    
    const interval = setInterval(async () => {
      try {
        // If no supplied assets, keep rewards at 0
        if (!contractData?.user?.supplied) {
          setRewards(0)
          return
        }
        const accruedRewards = await contractUtils.getAccruedRewards(provider, account)
        setRewards(accruedRewards || 0)
      } catch (error) {
        console.error('Error fetching rewards:', error)
      }
    }, 10000)
    
    return () => clearInterval(interval)
  }, [account, provider])

  const connectMetaMask = async () => {
    const mm = detectMetaMaskProvider()
    if (!mm) {
      alert('MetaMask is not installed. Please install MetaMask to continue.')
      return
    }

    setIsConnecting(true)
    try {
      // Request accounts first
      const accounts = await mm.request({ method: 'eth_requestAccounts' })
      if (!accounts || accounts.length === 0) {
        throw new Error('No accounts returned from MetaMask')
      }
      
      // Switch to QIE Mainnet BEFORE creating provider
      try {
        await mm.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: QIE_NETWORK.chainId }],
        })
        console.log('Switched to QIE Mainnet')
      } catch (switchError) {
        // Chain doesn't exist, add it
        if (switchError.code === 4902) {
          await mm.request({
            method: 'wallet_addEthereumChain',
            params: [QIE_NETWORK],
          })
          console.log('Added QIE Mainnet to MetaMask')
        } else {
          console.error('Error switching chain:', switchError)
          throw switchError
        }
      }
      
      // Wait a bit for chain switch to complete
      await new Promise(resolve => setTimeout(resolve, 500))
      
      // Create provider AFTER chain switch
      const newProvider = new ethers.BrowserProvider(mm)
      
      // Verify we're on the correct network
      const network = await newProvider.getNetwork()
      console.log('Connected network:', network)
      if (network.chainId !== BigInt(1990)) {
        console.warn('Warning: Not on QIE Mainnet. Chain ID:', network.chainId)
      }
      
      setProvider(newProvider)
      const connectedAccount = accounts[0]
      setAccount(connectedAccount)
      setWallet('metamask')
      setShowWalletMenu(false)
      // Initialize wallet in leaderboard with 0 points
      initializeWalletInLeaderboard(connectedAccount)
      
      // Fetch data immediately after connection
      if (CONTRACT_ADDRESS !== '0x0000000000000000000000000000000000000000') {
        setTimeout(() => {
          fetchContractData()
          fetchWalletBalance()
        }, 1000)
      }
    } catch (error) {
      console.error('Error connecting MetaMask:', error)
      alert(`Failed to connect MetaMask: ${error.message || 'Please try again.'}`)
    } finally {
      setIsConnecting(false)
    }
  }

  const connectQIEWallet = async () => {
    const qie = detectQieProvider()
    if (!qie) {
      alert('QIE Wallet is not detected. Please open the extension or app and try again.')
      return
    }

      setIsConnecting(true)
      try {
      const newProvider = new ethers.BrowserProvider(qie)
      setProvider(newProvider)
      const accounts = await qie.request({ method: 'eth_requestAccounts' })
      const connectedAccount = accounts[0]
      setAccount(connectedAccount)
        setWallet('qiewallet')
        setShowWalletMenu(false)
      // Initialize wallet in leaderboard with 0 points
      initializeWalletInLeaderboard(connectedAccount)
      } catch (error) {
        console.error('Error connecting QIE Wallet:', error)
        alert('Failed to connect QIE Wallet. Please try again.')
      } finally {
        setIsConnecting(false)
    }
  }

  const disconnect = () => {
    setAccount(null)
    setWallet(null)
    setProvider(null)
    setShowWalletMenu(false)
    setContractData(null)
    setRewards(0)
  }

  const utilization = useMemo(() => {
    const totals = contractData?.totals || mockState.totals
    const { supply, borrow } = totals
    if (!supply) return 0
    return (borrow / supply) * 100
  }, [contractData])

  const netApy = useMemo(() => {
    const totals = contractData?.totals || mockState.totals
    const user = account && contractData?.user ? contractData.user : { supplied: 0, borrowed: 0 }
    const { supplyApy, borrowApy } = totals
    const { supplied, borrowed } = user
    if (!supplied) return 0
    const gross = (supplied * supplyApy - borrowed * borrowApy) / supplied
    return gross
  }, [account, contractData])

  // Points & leaderboard
  useEffect(() => {
    if (!account) {
      setPoints(0)
    }
  }, [account])

  // Sync points from contractData when it updates
  useEffect(() => {
    if (contractData?.points !== undefined && contractData?.points !== null) {
      setPoints(contractData.points)
    }
  }, [contractData?.points])

  const displayPoints = useMemo(() => {
    if (contractData?.points !== undefined && contractData?.points !== null) {
      return contractData.points
    }
    return points || 0
  }, [contractData, points])

  const computedLeaderboard = useMemo(() => {
    // Load all wallets from localStorage
    const storedLeaderboard = getLeaderboardFromStorage()
    const leaderboardArray = Object.values(storedLeaderboard).map(entry => ({
      address: formatAddress(entry.address),
      points: Math.max(entry.points || 0, 0),
      fullAddress: entry.address
    }))
    
    // If current account is connected, ensure it's in the leaderboard with current points
    if (account) {
      const normalizedAccount = account.toLowerCase()
      const existingIndex = leaderboardArray.findIndex(entry => entry.fullAddress === normalizedAccount)
      const currentPoints = Math.max(displayPoints, 0)
      
      console.log('Leaderboard computation:', {
        account: normalizedAccount,
        displayPoints,
        currentPoints,
        existingIndex,
        storedPoints: existingIndex >= 0 ? leaderboardArray[existingIndex].points : 'not found'
      })
      
      if (existingIndex >= 0) {
        // Update existing entry with current points (always use latest)
        leaderboardArray[existingIndex].points = currentPoints
        // Also update in localStorage to keep it in sync
        updateWalletPoints(account, currentPoints)
      } else {
        // Add current account if not in leaderboard
        leaderboardArray.push({
          address: formatAddress(account),
          points: currentPoints,
          fullAddress: normalizedAccount
        })
        // Initialize in localStorage
        initializeWalletInLeaderboard(account)
        updateWalletPoints(account, currentPoints)
      }
    }
    
    return leaderboardArray
      .sort((a, b) => b.points - a.points)
      .map((entry, idx) => ({
        address: entry.address,
        points: entry.points,
        rank: idx + 1,
      }))
  }, [account, displayPoints])

  const availableToBorrow = useMemo(() => {
    if (account && contractData) {
      return contractData.availableToBorrow || 0
    }
    if (account && !contractData) return 0
    const { supplied, borrowed } = mockState.user
    // Only use collateral-enabled assets for borrowing calculation
    if (!supplied || !collateralEnabled || !account) return 0
    const collateralFactor = 0.7 // 70% of collateral can be borrowed
    const maxBorrow = supplied * collateralFactor
    const currentBorrow = borrowed
    return Math.max(0, maxBorrow - currentBorrow)
  }, [account, collateralEnabled, contractData])

  // Update displayed values to use contract data when available
  const displayState = useMemo(() => {
    const defaultUserState = { supplied: 0, borrowed: 0, healthFactor: 1.5, targetHealth: 1.5, balance: 0 }
    
    const userStateRaw =
      account && contractData && contractData.user
        ? contractData.user
        : defaultUserState

    const hasPositions = (userStateRaw?.supplied || 0) > 0 || (userStateRaw?.borrowed || 0) > 0
    const userState = {
      ...defaultUserState,
      ...userStateRaw,
      healthFactor: hasPositions ? (userStateRaw?.healthFactor || 1.5) : 1.5,
    }

    const totalsState = contractData?.totals || mockState.totals

      return {
      totals: totalsState || mockState.totals,
      user: userState,
    }
  }, [account, contractData])

  const collateralMetrics = useMemo(() => {
    const borrowed = displayState.user.borrowed || 0
    const liveAvailable = availableToBorrowLive || availableToBorrow || 0
    const capacity = borrowed + liveAvailable
    const remaining = Math.max(0, liveAvailable)
    return { capacity, remaining }
  }, [displayState.user.borrowed, availableToBorrow, availableToBorrowLive])

  // Wallet native QIE balance
  const fetchWalletBalance = async () => {
    if (!account || !provider) {
      setWalletBalance(account ? 0 : mockState.user.balance)
      return
    }
    try {
      // Ensure provider is properly set up
      const ethersProvider = provider
      if (!ethersProvider) {
        console.error('Provider is null')
        setWalletBalance(0)
        return
      }
      
      // Get balance with proper error handling
      const balance = await ethersProvider.getBalance(account)
      const balanceFormatted = parseFloat(ethers.formatEther(balance))
      console.log('Wallet balance fetched:', balanceFormatted, 'QIE for account:', account)
      setWalletBalance(balanceFormatted)
    } catch (err) {
      console.error('Error fetching wallet balance:', err)
      // Try to get network info for debugging
      try {
        const network = await provider.getNetwork()
        console.log('Current network:', network)
      } catch (netErr) {
        console.error('Error getting network:', netErr)
      }
      setWalletBalance(0)
    }
  }

  useEffect(() => {
    let isMounted = true
    const loop = async () => {
      if (!isMounted) return
      await fetchWalletBalance()
      if (isMounted) setTimeout(loop, 5000)
    }
    loop()
    return () => {
      isMounted = false
    }
  }, [account, provider])

  // Fetch QIE price from Oracle
  const fetchQIEPrice = async () => {
    try {
      // getQIEPrice can handle null provider (creates its own)
      const price = await contractUtils.getQIEPrice(provider)
      setQiePrice(price)
    } catch (err) {
      console.error('Error fetching QIE price from Oracle:', err)
      // Keep current price or fallback to 0.13
      if (qiePrice === 0.13) {
        // Only log if we haven't set a price yet
        console.warn('Using fallback QIE price: 0.13')
      }
    }
  }

  // Fetch QIE price on mount and periodically
  useEffect(() => {
    fetchQIEPrice() // Fetch immediately
    const interval = setInterval(() => {
      fetchQIEPrice()
    }, 60000) // Update every 60 seconds

    return () => clearInterval(interval)
  }, [provider]) // Re-fetch if provider changes

  // Fetch token prices from oracles
  useEffect(() => {
    const fetchTokenPrices = async () => {
      const prices = {}
      const tokens = ['SOL', 'ETH', 'BTC', 'XRP', 'BNB']
      
      for (const token of tokens) {
        try {
          const price = await contractUtils.getTokenPrice(token, provider)
          prices[token] = price
        } catch (error) {
          console.error(`Error fetching ${token} price:`, error)
          prices[token] = null
        }
      }
      
      setTokenPrices(prev => ({ ...prev, ...prices }))
    }
    
    fetchTokenPrices()
    const interval = setInterval(fetchTokenPrices, 60000) // Update every 60 seconds
    return () => clearInterval(interval)
  }, [provider])

  const displayedHealthFactor = useMemo(() => {
    const raw = displayState.user.healthFactor
    // If supplied but no borrow, health factor is effectively very safe; show capped high value
    if (displayState.user.supplied > 0 && displayState.user.borrowed === 0) {
      if (Number.isFinite(raw)) return Math.min(Math.max(raw, 1.5), 10)
      return 10
    }
    // If borrowing, show the actual value but cap to avoid UI blow-up
    if (!Number.isFinite(raw)) return 1.5
    return Math.min(Math.max(raw, 0), 10)
  }, [displayState.user.healthFactor, displayState.user.supplied, displayState.user.borrowed])

  const liquidationPercentage = useMemo(() => {
    const healthFactor = displayedHealthFactor
    if (healthFactor >= 1.5) return 0
    if (healthFactor <= 1.0) return 100
    const range = 1.5 - 1.0
    const distance = healthFactor - 1.0
    return Math.max(0, Math.min(100, ((range - distance) / range) * 100))
  }, [displayedHealthFactor])

  const claimRewards = async () => {
    if (!account || !provider || rewards <= 0) return
    
    try {
      await contractUtils.claimRewards(provider, account)
      await fetchContractData()
      alert(`Successfully claimed ${rewards.toFixed(4)} QIE rewards!`)
    } catch (error) {
      console.error('Error claiming rewards:', error)
      alert('Failed to claim rewards. Please try again.')
    }
  }

  const handleSupply = async () => {
    if (!account || !provider || !supplyAmount || parseFloat(supplyAmount) <= 0) return
    
    // Check if collateral was previously enabled
    const wasCollateralEnabled = collateralEnabled
    
    try {
      await contractUtils.supply(provider, supplyAmount, account)
      // Increment transaction count
      incrementTransactionCount()
      setSupplyAmount('')
      // Wait a bit for the transaction to be confirmed on-chain
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      // If collateral was enabled before, enable it for the new supply
      if (wasCollateralEnabled) {
        try {
          await contractUtils.setCollateralEnabled(provider, true, account)
          console.log('Collateral automatically enabled for new supply')
        } catch (collateralError) {
          console.error('Error enabling collateral after supply:', collateralError)
          // Don't fail the whole operation if collateral enable fails
        }
      }
      
      await fetchContractData()
      
      // Update available to borrow after supply
      try {
        const available = await contractUtils.getAvailableToBorrow(provider, account)
        setAvailableToBorrowLive(available || 0)
        console.log('Available to borrow updated after supply:', available)
      } catch (e) {
        console.error('Error updating availableToBorrow after supply:', e)
      }
      
      // Explicitly recalculate points after data fetch
      if (POINTS_CONTRACT_ADDRESS !== '0x0000000000000000000000000000000000000000') {
        try {
          const [supplyBal, borrowBal] = await Promise.all([
            contractUtils.getSupplyBalance(provider, account),
            contractUtils.getBorrowBalance(provider, account)
          ])
          const newPoints = await contractUtils.calculatePoints(provider, supplyBal, borrowBal)
          setPoints(newPoints)
          updateWalletPoints(account, newPoints)
          console.log('Points updated after supply:', newPoints)
        } catch (err) {
          console.error('Error updating points after supply:', err)
        }
      }
      alert('Successfully supplied QIE!')
    } catch (error) {
      console.error('Error supplying:', error)
      alert('Failed to supply. Please try again.')
    }
  }

  const handleWithdraw = async () => {
    if (!account || !provider || !withdrawAmount || parseFloat(withdrawAmount) <= 0) {
      console.log('Withdraw validation failed:', { account, provider, withdrawAmount })
      return
    }
    
    const requestedAmount = parseFloat(withdrawAmount)
    const supplied = contractData?.user?.supplied || 0
    
    // Basic balance check only - let contract handle collateral validation
    if (requestedAmount > supplied) {
      alert(`Cannot withdraw ${requestedAmount.toFixed(4)} QIE. You have ${supplied.toFixed(4)} QIE supplied.`)
      return
    }
    
    console.log('Attempting withdraw:', { requestedAmount, supplied, account })
    
    try {
      const tx = await contractUtils.withdraw(provider, withdrawAmount, account)
      console.log('Withdraw transaction sent:', tx)
      // Increment transaction count
      incrementTransactionCount()
      setWithdrawAmount('')
      // Wait a bit for the transaction to be confirmed on-chain
      await new Promise(resolve => setTimeout(resolve, 2000))
      await fetchContractData()
      // Explicitly recalculate points after data fetch
      if (POINTS_CONTRACT_ADDRESS !== '0x0000000000000000000000000000000000000000') {
        try {
          const [supplyBal, borrowBal] = await Promise.all([
            contractUtils.getSupplyBalance(provider, account),
            contractUtils.getBorrowBalance(provider, account)
          ])
          const newPoints = await contractUtils.calculatePoints(provider, supplyBal, borrowBal)
          setPoints(newPoints)
          updateWalletPoints(account, newPoints)
          console.log('Points updated after withdraw:', newPoints)
        } catch (err) {
          console.error('Error updating points after withdraw:', err)
        }
      }
      alert('Successfully withdrew QIE!')
    } catch (error) {
      console.error('Error withdrawing:', error)
      
      const borrowed = contractData?.user?.borrowed || 0
      
      // Decode custom error if present
      let errorMessage = 'Failed to withdraw. Please try again.'
      if (error.data) {
        const errorSelector = error.data.slice(0, 10)
        // Error selectors: CollateralDisabled=0x02e2d6e6, InsufficientBalance=0xf4d678b8
        if (errorSelector === '0x02e2d6e6') {
          const maxWithdrawable = borrowed > 0 ? Math.max(0, supplied - (borrowed / 0.7)) : supplied
          errorMessage = `Cannot withdraw ${requestedAmount.toFixed(4)} QIE. This would leave insufficient collateral for your ${borrowed.toFixed(4)} QIE borrowed. Maximum withdrawable: ${maxWithdrawable.toFixed(4)} QIE.`
        } else if (errorSelector === '0xf4d678b8') {
          errorMessage = `Insufficient balance. You have ${supplied.toFixed(4)} QIE supplied.`
        }
      } else if (error.reason) {
        errorMessage = error.reason
      }
      
      alert(errorMessage)
    }
  }

  const handleBorrow = async () => {
    if (!account || !provider || !borrowAmount || parseFloat(borrowAmount) <= 0) return
    
    // Refresh availableToBorrow from contract right before borrowing to get latest value
    let available = 0
    try {
      available = await contractUtils.getAvailableToBorrow(provider, account)
      setAvailableToBorrowLive(available || 0)
      console.log('Available to borrow from contract:', available)
    } catch (e) {
      console.error('Error fetching availableToBorrow:', e)
      available = contractData?.availableToBorrow || 0
    }
    
    const requestedAmount = parseFloat(borrowAmount)
    console.log('Requested borrow amount:', requestedAmount, 'Available:', available)
    
    // Validate borrow amount against available capacity (with small buffer for rounding)
    if (requestedAmount > available + 0.0001) {
      alert(`Cannot borrow ${requestedAmount.toFixed(4)} QIE. Available to borrow: ${available.toFixed(4)} QIE`)
      return
    }
    
    // Check if collateral is enabled
    if (!contractData?.user?.collateralEnabled) {
      alert('Please enable collateral first before borrowing')
      return
    }
    
    try {
      await contractUtils.borrow(provider, borrowAmount, account)
      // Increment transaction count
      incrementTransactionCount()
      setBorrowAmount('')
      // Wait a bit for the transaction to be confirmed on-chain
      await new Promise(resolve => setTimeout(resolve, 2000))
      await fetchContractData()
      // Explicitly recalculate points after data fetch
      if (POINTS_CONTRACT_ADDRESS !== '0x0000000000000000000000000000000000000000') {
        try {
          const [supplyBal, borrowBal] = await Promise.all([
            contractUtils.getSupplyBalance(provider, account),
            contractUtils.getBorrowBalance(provider, account)
          ])
          const newPoints = await contractUtils.calculatePoints(provider, supplyBal, borrowBal)
          setPoints(newPoints)
          updateWalletPoints(account, newPoints)
          console.log('Points updated after borrow:', newPoints)
        } catch (err) {
          console.error('Error updating points after borrow:', err)
        }
      }
      alert('Successfully borrowed QIE!')
    } catch (error) {
      console.error('Error borrowing:', error)
      
      // Refresh availableToBorrow to show current value in error
      try {
        available = await contractUtils.getAvailableToBorrow(provider, account)
        setAvailableToBorrowLive(available || 0)
      } catch (e) {
        // Ignore
      }
      
      // Decode custom error if present
      let errorMessage = 'Failed to borrow. Please try again.'
      if (error.data) {
        const errorSelector = error.data.slice(0, 10)
        // Error selectors: ExceedsBorrowCapacity=0x5e4c2038, CollateralDisabled=0x02e2d6e6, InsufficientLiquidity=0xbb55fd27
        if (errorSelector === '0x5e4c2038') {
          errorMessage = `Borrow amount (${requestedAmount.toFixed(4)} QIE) exceeds available capacity. Current available: ${available.toFixed(4)} QIE. Please refresh and try again.`
        } else if (errorSelector === '0x02e2d6e6') {
          errorMessage = 'Collateral is not enabled. Please enable collateral first.'
        } else if (errorSelector === '0xbb55fd27') {
          errorMessage = 'Insufficient liquidity in the protocol. Please try a smaller amount.'
        }
      } else if (error.reason) {
        errorMessage = error.reason
      }
      
      alert(errorMessage)
    }
  }

  const handleRepay = async () => {
    if (!account || !provider || !repayAmount || parseFloat(repayAmount) <= 0) return
    
    try {
      await contractUtils.repay(provider, repayAmount, account)
      // Increment transaction count
      incrementTransactionCount()
      setRepayAmount('')
      // Wait a bit for the transaction to be confirmed on-chain
      await new Promise(resolve => setTimeout(resolve, 2000))
      await fetchContractData()
      // Explicitly recalculate points after data fetch
      if (POINTS_CONTRACT_ADDRESS !== '0x0000000000000000000000000000000000000000') {
        try {
          const [supplyBal, borrowBal] = await Promise.all([
            contractUtils.getSupplyBalance(provider, account),
            contractUtils.getBorrowBalance(provider, account)
          ])
          const newPoints = await contractUtils.calculatePoints(provider, supplyBal, borrowBal)
          setPoints(newPoints)
          updateWalletPoints(account, newPoints)
          console.log('Points updated after repay:', newPoints)
        } catch (err) {
          console.error('Error updating points after repay:', err)
        }
      }
      alert('Successfully repaid QIE!')
    } catch (error) {
      console.error('Error repaying:', error)
      alert('Failed to repay. Please try again.')
    }
  }

  const handleToggleCollateral = async (enabled) => {
    if (!account || !provider) return
    
    try {
      await contractUtils.setCollateralEnabled(provider, enabled, account)
      // Refresh from chain to reflect actual state
      await fetchContractData()
      alert(`Collateral ${enabled ? 'enabled' : 'disabled'} successfully!`)
    } catch (error) {
      console.error('Error toggling collateral:', error)
      alert('Failed to toggle collateral. Please try again.')
    }
  }

  if (activePage === 'landing') {
  return (
      <div className="app-container landing-page dark-theme">
        <nav className="top-nav dark glass">
          <div className="logo">QieLend</div>
          <button className="launch-btn glass" onClick={() => navigate('dashboard')}>
            Launch App
          </button>
        </nav>

        <div className="landing-hero">
          <div className="hero-text">
            <div className="hero-line">THE UNIVERSAL</div>
            <div className="hero-line">MONEY MARKET</div>
            <div className="hero-line">FOR QIE NETWORK</div>
          </div>
          
          <div className="landing-stats">
            <div className="stats-column">
              <div className="stat-item glass">
                <div className="stat-label">Total market size®</div>
                <div className="stat-value">
                  {landingStats.marketSize >= 1000000 
                    ? `${(landingStats.marketSize / 1000000).toFixed(1)}M+ QIE`
                    : landingStats.marketSize >= 1000
                    ? `${(landingStats.marketSize / 1000).toFixed(1)}K+ QIE`
                    : `${landingStats.marketSize.toFixed(0)} QIE`}
                </div>
              </div>
              <div className="stat-item glass">
                <div className="stat-label">Total users®</div>
                <div className="stat-value">{landingStats.totalUsers.toLocaleString()}</div>
              </div>
            </div>
            <div className="stats-column">
              <div className="stat-item glass">
                <div className="stat-label">Total transactions®</div>
                <div className="stat-value">
                  {landingStats.totalTransactions >= 1000000 
                    ? `${(landingStats.totalTransactions / 1000000).toFixed(1)}M+`
                    : landingStats.totalTransactions >= 1000
                    ? `${(landingStats.totalTransactions / 1000).toFixed(1)}K+`
                    : landingStats.totalTransactions.toLocaleString()}
                </div>
              </div>
              <div className="stat-item glass">
                <div className="stat-label">Total chains®</div>
                <div className="stat-value">1</div>
              </div>
            </div>
          </div>
        </div>

        <section className="about-section" id="about">
          <div className="about-content glass">
            <h2>About QieLend</h2>
            <p className="about-text">
              QieLend is a next-generation lending and borrowing protocol built on the QIE Network, 
              leveraging high throughput, low fees, and EVM compatibility to deliver a superior DeFi experience.
            </p>
            <div className="about-features">
              <div className="about-feature">
                <h3>Powered by QIE Network</h3>
                <p>Built on QIE's high-performance Layer 1 blockchain with dPoS consensus, enabling fast transactions and minimal gas costs for seamless lending operations.</p>
              </div>
              <div className="about-feature">
                <h3>Ultra-Low Fees</h3>
                <p>Benefit from QIE Network's low transaction fees, maximizing your returns on supplied assets and minimizing borrowing costs.</p>
              </div>
              <div className="about-feature">
                <h3>Real-Time Rewards</h3>
                <p>Watch your APR earnings accumulate in real-time with transparent, on-chain reward distribution that updates every second.</p>
              </div>
              <div className="about-feature">
                <h3>Secure & Transparent</h3>
                <p>EVM-compatible smart contracts ensure security and interoperability, with full transparency on all protocol operations and rates.</p>
              </div>
            </div>
          </div>
        </section>

        <footer className="app-footer">
          <div className="footer-left">
            <span>© 2025 QieLend All rights reserved</span>
          </div>
          <div className="footer-right">
            <a href="https://t.me/qielend" target="_blank" rel="noopener noreferrer">Telegram</a>
            <a href="https://twitter.com/qielend" target="_blank" rel="noopener noreferrer">X</a>
            <a href="https://discord.gg/qielend" target="_blank" rel="noopener noreferrer">Discord</a>
            <a href="https://github.com/thestatisticia/QieLend" target="_blank" rel="noopener noreferrer">GitHub</a>
            <a href="https://github.com/thestatisticia/QieLend/blob/main/DOCS.md" target="_blank" rel="noopener noreferrer" className="docs-link">
              <span>📖</span> Docs
            </a>
          </div>
        </footer>
      </div>
    )
  }

  return (
    <div className="app-container dark-theme">
      <nav className="top-nav dark">
        <div className="logo">QieLend</div>
        <ul className="nav-links">
          {['dashboard', 'portfolio', 'overview', 'market', 'points'].map((key) => (
            <li key={key}>
              <button
                className={`link ${activePage === key ? 'active' : ''}`}
                onClick={() => navigate(key)}
              >
                {key.charAt(0).toUpperCase() + key.slice(1)}
              </button>
          </li>
          ))}
        </ul>
        <div className="wallet-container">
          {account ? (
            <div className="wallet-info">
              <span className="wallet-badge">{wallet === 'metamask' ? '🦊' : '🔷'}</span>
              <span className="wallet-address">{formatAddress(account)}</span>
              <button className="ghost small" onClick={disconnect}>
                Disconnect
              </button>
            </div>
          ) : (
            <div className="wallet-menu-wrapper">
              <button className="primary" onClick={() => setShowWalletMenu(!showWalletMenu)}>
                Connect Wallet
              </button>
              {showWalletMenu && (
                <div className="wallet-menu">
        <button
                    className="wallet-option"
                    onClick={connectMetaMask}
                    disabled={isConnecting}
                  >
                    <span>🦊</span>
                    <div>
                      <strong>MetaMask</strong>
                      <p>Connect using MetaMask</p>
                    </div>
        </button>
            <button
                    className="wallet-option"
                    onClick={connectQIEWallet}
                    disabled={isConnecting}
                  >
                    <span>🔷</span>
                    <div>
                      <strong>QIE Wallet</strong>
                      <p>Connect using QIE Wallet</p>
                    </div>
            </button>
                </div>
              )}
          </div>
          )}
        </div>
      </nav>

      {activePage === 'dashboard' && (
        <div className="dashboard-layout-new">
          {!account ? (
            <div className="card glass connect-card">
              <h2>Connect your wallet</h2>
              <p className="hint">Connect to view personalized dashboard stats.</p>
              <button className="primary" onClick={() => setShowWalletMenu(true)}>
                Connect Wallet
              </button>
            </div>
          ) : (
            <>
          <div className="dashboard-main-new">
            <div className="dashboard-top-cards">
              <div className="dashboard-metric-card">
                <p className="label">MY SUPPLY BALANCE</p>
                    <h2>{displayState.user.supplied.toFixed(2)} QIE</h2>
                    <p className="subtext">~${(displayState.user.supplied * qiePrice).toFixed(2)} • NET APR {netApy.toFixed(2)}%</p>
              </div>
              <div className="dashboard-metric-card">
                <p className="label">AVAILABLE TO BORROW</p>
                    <h2>{(availableToBorrowLive || availableToBorrow || 0).toFixed(2)} QIE</h2>
                    <p className="subtext">~${((availableToBorrowLive || availableToBorrow || 0) * qiePrice).toFixed(2)}</p>
              </div>
              <div className="dashboard-metric-card">
                    <p className="label">WALLET BALANCE</p>
                    <h2>{walletBalance.toFixed(2)} QIE</h2>
                    <p className="subtext">~${(walletBalance * qiePrice).toFixed(2)}</p>
              </div>
              <div className="dashboard-metric-card health-factor-card">
                <p className="label">HEALTH FACTOR</p>
                    <h2>{displayedHealthFactor.toFixed(1)}</h2>
                <div className="health-progress">
                  <span
                    className="health-bar"
                        style={{ width: `${Math.min((displayedHealthFactor / 3) * 100, 100)}%` }}
                  />
                </div>
              </div>
        </div>

            <div className="dashboard-summary-two">
              <section className="dashboard-card summary-card">
                <div className="card-header">
                  <h3>Supplies</h3>
                      <div className="summary-pill">Supply Balance {displayState.user.supplied.toFixed(2)} QIE</div>
                      <div className="summary-pill">
                        Collateral room {collateralEnabled ? `${collateralMetrics.remaining.toFixed(2)} QIE` : '0.00 QIE'}
                      </div>
                </div>
                <div className="summary-grid">
                  <div>
                    <p className="label">Token</p>
                    <p className="asset-name">QIE</p>
                  </div>
                  <div>
                    <p className="label">APR</p>
                    <p className="asset-apr">{displayState.totals.supplyApy}%</p>
                  </div>
                  <div>
                    <p className="label">Balance</p>
                        <p className="asset-apr">{displayState.user.supplied.toFixed(2)} QIE</p>
                        <p className="subtext" style={{ fontSize: '0.75rem', opacity: 0.7 }}>~${(displayState.user.supplied * qiePrice).toFixed(2)}</p>
          </div>
                  <div>
                    <p className="label">Collateral</p>
                    <label className="collateral-switch">
                      <input
                        type="checkbox"
                        checked={collateralEnabled}
                        onChange={(e) => handleToggleCollateral(e.target.checked)}
                        disabled={!account || !provider}
                      />
                      <span className="switch-slider"></span>
                    </label>
                  </div>
                </div>
                <div className="section-footer">
                  {collateralEnabled ? (
                        <>
                          <p>Available to borrow: <strong>{(availableToBorrowLive || availableToBorrow || 0).toFixed(2)} QIE</strong> (~${((availableToBorrowLive || availableToBorrow || 0) * qiePrice).toFixed(2)})</p>
                          <p>Collateral remaining: <strong>{collateralMetrics.remaining.toFixed(2)} QIE</strong></p>
                        </>
                  ) : (
                    <p className="liquidation-warning">Enable collateral to borrow</p>
                  )}
                </div>
        </section>

              <section className="dashboard-card summary-card">
                <div className="card-header">
                  <h3>Borrows</h3>
                      <div className="summary-pill">Borrow Balance {displayState.user.borrowed.toFixed(2)} QIE</div>
                </div>
                <div className="summary-grid">
                  <div>
                    <p className="label">Token</p>
                    <p className="asset-name">QIE</p>
                  </div>
                  <div>
                    <p className="label">APR</p>
                    <p className="asset-apr">{displayState.totals.borrowApy}%</p>
          </div>
            <div>
                    <p className="label">Balance</p>
                        <p className="asset-apr">{displayState.user.borrowed.toFixed(2)} QIE</p>
                        <p className="subtext" style={{ fontSize: '0.75rem', opacity: 0.7 }}>~${(displayState.user.borrowed * qiePrice).toFixed(2)}</p>
            </div>
            <div>
                    <p className="label">Health</p>
                        <p className="asset-apr">{displayedHealthFactor.toFixed(1)}</p>
                  </div>
                </div>
                <div className="section-footer">
                      {liquidationPercentage > 0 ? (
                    <p className="liquidation-warning">
                      Liquidation risk: {liquidationPercentage.toFixed(1)}% to threshold
                    </p>
                      ) : (
                        <p>Risk level: Safe</p>
                  )}
                </div>
              </section>
            </div>

            {account && (
              <div className="rewards-section">
                <div className="dashboard-card rewards-card">
                  <div className="rewards-header">
                    <h3>Rewards</h3>
                        <button
                          className="claim-btn"
                          onClick={claimRewards}
                          disabled={rewards === 0 || !contractData?.user?.supplied}
                        >
                      Claim
                    </button>
                  </div>
                  <div className="rewards-amount">
                    <p className="label">Accumulating</p>
                        <h2>{rewards.toFixed(2)} QIE</h2>
                    <p className="rewards-hint">APR earnings accumulate in real-time based on your supplied assets ({displayState.totals.supplyApy}% APY)</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="dashboard-sidebar">
            <div className="action-tabs">
              {['supply', 'withdraw', 'borrow', 'repay'].map((action) => (
                <button
                  key={action}
                  className={`action-tab ${activeAction === action ? 'active' : ''}`}
                  onClick={() => setActiveAction(action)}
                >
                  {action.charAt(0).toUpperCase() + action.slice(1)}
                </button>
              ))}
          </div>

            <div className="action-content">
              <div className="amount-input">
                    <input
                  type="number"
                  placeholder="0.00"
                  value={
                    activeAction === 'supply'
                      ? supplyAmount
                      : activeAction === 'withdraw'
                        ? withdrawAmount
                        : activeAction === 'borrow'
                          ? borrowAmount
                          : repayAmount
                  }
                  onChange={(e) => {
                    const val = e.target.value
                    if (activeAction === 'supply') setSupplyAmount(val)
                    else if (activeAction === 'withdraw') setWithdrawAmount(val)
                    else if (activeAction === 'borrow') setBorrowAmount(val)
                    else setRepayAmount(val)
                  }}
                />
                <p className="muted">QIE</p>
              </div>

              <div className="percent-buttons">
                {[25, 50, 75, 100].map((pct) => (
                  <button
                    key={pct}
                    className="percent-btn"
                    onClick={() => {
                      const max =
                        activeAction === 'supply'
                              ? walletBalance
                          : activeAction === 'withdraw'
                            ? displayState.user.supplied
                            : activeAction === 'borrow'
                              ? availableToBorrow
                              : displayState.user.borrowed
                      const val = (max * pct) / 100
                      if (activeAction === 'supply') setSupplyAmount(val.toString())
                      else if (activeAction === 'withdraw') setWithdrawAmount(val.toString())
                      else if (activeAction === 'borrow') setBorrowAmount(val.toString())
                      else setRepayAmount(val.toString())
                    }}
                  >
                    {pct}%
                  </button>
                ))}
              </div>

              <div className="asset-selector">
                    <span>
                      {activeAction === 'supply' ? 'Supply' : 
                       activeAction === 'withdraw' ? 'Withdraw' : 
                       activeAction === 'borrow' ? 'Borrow' : 
                       'Repay'} QIE
                    </span>
              </div>

              <div className="health-preview">
                <p className="label">Health Factor</p>
                    <p className="health-value">
                      {displayedHealthFactor.toFixed(1)} → {displayedHealthFactor.toFixed(1)}
                    </p>
            </div>

          <button
                className="primary wide action-btn" 
                disabled={
                  !account || 
                  (activeAction === 'borrow' && (!collateralEnabled || availableToBorrow <= 0))
                }
                onClick={() => {
                  if (activeAction === 'supply') handleSupply()
                  else if (activeAction === 'withdraw') handleWithdraw()
                  else if (activeAction === 'borrow') handleBorrow()
                  else handleRepay()
                }}
              >
                {activeAction === 'supply'
                  ? 'Deposit'
                  : activeAction === 'withdraw'
                    ? 'Withdraw'
                    : activeAction === 'borrow'
                      ? 'Borrow'
                      : 'Repay'}
          </button>

              <div className="action-details">
                <div className="detail-row">
                  <span>Balance QIE</span>
                  <strong>{format(walletBalance)}</strong>
                </div>
                <div className="detail-row">
                  <span>
                    {activeAction === 'supply' || activeAction === 'withdraw' ? 'Supply' : 'Borrow'} APR
                  </span>
                  <strong>
                    {activeAction === 'supply' || activeAction === 'withdraw'
                      ? displayState.totals.supplyApy
                      : displayState.totals.borrowApy}
                    %
                  </strong>
                </div>
                <div className="detail-row">
                  <span>
                    {activeAction === 'supply' || activeAction === 'withdraw' ? 'Supply' : 'Borrow'} Balance
                  </span>
                  <strong>
                    {activeAction === 'supply' || activeAction === 'withdraw'
                      ? format(displayState.user.supplied)
                      : format(displayState.user.borrowed)}
                  </strong>
                </div>
              </div>
            </div>
          </div>
            </>
          )}
        </div>
      )}

      {activePage === 'overview' && (
        <div className="portfolio-layout">
          <div className="portfolio-summary-card glass">
            <h3>Protocol Overview</h3>
          <div className="market-stats">
            <div className="market-stat">
              <p className="label">Total Market Size</p>
                <h2>
                  {displayState.totals.marketSize >= 1000000 
                    ? `${(displayState.totals.marketSize / 1000000).toFixed(2)}M QIE`
                    : displayState.totals.marketSize >= 1000
                    ? `${(displayState.totals.marketSize / 1000).toFixed(2)}K QIE`
                    : `${displayState.totals.marketSize.toFixed(2)} QIE`}
                </h2>
                <p className="subtext" style={{ fontSize: '0.875rem', opacity: 0.7 }}>
                  ~${(displayState.totals.marketSize * qiePrice).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                </p>
            </div>
            <div className="market-stat">
              <p className="label">Total Supplied</p>
                <h2>
                  {displayState.totals.supply >= 1000000 
                    ? `${(displayState.totals.supply / 1000000).toFixed(2)}M QIE`
                    : displayState.totals.supply >= 1000
                    ? `${(displayState.totals.supply / 1000).toFixed(2)}K QIE`
                    : `${displayState.totals.supply.toFixed(2)} QIE`}
                </h2>
                <p className="subtext" style={{ fontSize: '0.875rem', opacity: 0.7 }}>
                  ~${(displayState.totals.supply * qiePrice).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                </p>
            </div>
            <div className="market-stat">
              <p className="label">Total Borrowed</p>
                <h2>{displayState.totals.borrow.toLocaleString('en-US', { maximumFractionDigits: 4 })} QIE</h2>
                <p className="subtext" style={{ fontSize: '0.875rem', opacity: 0.7 }}>~${(displayState.totals.borrow * qiePrice).toLocaleString('en-US', { maximumFractionDigits: 0 })}</p>
            </div>
            <div className="market-stat">
              <p className="label">Utilization</p>
              <h2>{utilization.toFixed(1)}%</h2>
            </div>
          </div>
          </div>
        </div>
      )}

      {activePage === 'market' && (
        <div className="portfolio-layout">
          <div className="portfolio-summary-card glass">
            <h3>Markets</h3>
            <div className="markets-table-minimal">
              <div className="markets-header-minimal">
                <div className="market-col-minimal asset-col">Asset</div>
                <div className="market-col-minimal price-col">Price</div>
                <div className="market-col-minimal apr-col">Supply APR</div>
                <div className="market-col-minimal apr-col">Borrow APR</div>
                <div className="market-col-minimal status-col">Status</div>
              </div>
              <div className="markets-body-minimal">
                {/* QIE - Active Market */}
                <div className="market-row-minimal active">
                  <div className="market-col-minimal asset-col">
                    <div className="asset-info-minimal">
                      <div>
                        <p className="asset-name-minimal">QIE</p>
                        <p className="asset-symbol-minimal">QIE Network</p>
                      </div>
                    </div>
                  </div>
                  <div className="market-col-minimal price-col">
                    <strong>${qiePrice.toFixed(4)}</strong>
                  </div>
                  <div className="market-col-minimal apr-col">
                    <strong>{displayState.totals.supplyApy.toFixed(2)}%</strong>
                  </div>
                  <div className="market-col-minimal apr-col">
                    <strong>{displayState.totals.borrowApy.toFixed(2)}%</strong>
                  </div>
                  <div className="market-col-minimal status-col">
                    <span className="status-badge-minimal active">Active</span>
                  </div>
                </div>

                {/* Coming Soon Markets */}
                {[
                  { symbol: 'SOL', name: 'Solana', supplyApr: 4.5, borrowApr: 7.2 },
                  { symbol: 'ETH', name: 'Ethereum', supplyApr: 3.8, borrowApr: 6.5 },
                  { symbol: 'BTC', name: 'Bitcoin', supplyApr: 2.5, borrowApr: 5.8 },
                  { symbol: 'XRP', name: 'Ripple', supplyApr: 4.2, borrowApr: 7.0 },
                  { symbol: 'BNB', name: 'Binance Coin', supplyApr: 4.0, borrowApr: 6.8 },
                ].map((asset) => {
                  const livePrice = tokenPrices[asset.symbol]
                  const fallbackPrice = asset.symbol === 'SOL' ? 150.25 : asset.symbol === 'ETH' ? 2450.80 : asset.symbol === 'BTC' ? 43250.00 : asset.symbol === 'XRP' ? 0.62 : 315.50
                  const displayPrice = livePrice !== null && livePrice !== undefined ? livePrice : fallbackPrice
                  
                  return (
                    <div key={asset.symbol} className="market-row-minimal coming-soon">
                      <div className="market-col-minimal asset-col">
                        <div className="asset-info-minimal">
                          <div>
                            <p className="asset-name-minimal">{asset.name}</p>
                            <p className="asset-symbol-minimal">{asset.symbol}</p>
                          </div>
                        </div>
                      </div>
                      <div className="market-col-minimal price-col">
                        <strong>
                          {livePrice !== null && livePrice !== undefined 
                            ? `$${displayPrice.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`
                            : `$${displayPrice.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`}
                        </strong>
                      </div>
                      <div className="market-col-minimal apr-col">
                        <strong>{asset.supplyApr.toFixed(2)}%</strong>
                      </div>
                      <div className="market-col-minimal apr-col">
                        <strong>{asset.borrowApr.toFixed(2)}%</strong>
                      </div>
                      <div className="market-col-minimal status-col">
                        <span className="status-badge-minimal coming-soon">Coming Soon</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {activePage === 'portfolio' && (
        <div className="portfolio-layout">
          {!account ? (
            <div className="card glass">
              <h2>Connect Your Wallet</h2>
              <p className="hint">Please connect your wallet to view your portfolio.</p>
            </div>
          ) : (
            <>
              <div className="portfolio-summary-card glass">
                <h3>Portfolio Summary</h3>
                <div className="portfolio-summary">
                  <div className="summary-section">
                    <h4 className="summary-section-title">Wallet Assets</h4>
                    <div className="summary-row">
                      <span>QIE</span>
                      <div className="summary-value">
                        <strong>{walletBalance.toFixed(2)} QIE</strong>
                        <span className="summary-usd">~${(walletBalance * qiePrice).toFixed(2)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="summary-section">
                    <h4 className="summary-section-title">Supplied</h4>
                    <div className="summary-row">
                      <span>QIE Supplied</span>
                      <div className="summary-value">
                        <strong>{displayState.user.supplied.toFixed(2)} QIE</strong>
                        <span className="summary-usd">~${(displayState.user.supplied * qiePrice).toFixed(2)}</span>
                      </div>
                    </div>
                    <div className="summary-row">
                      <span>APY</span>
                      <strong>{displayState.totals.supplyApy.toFixed(2)}%</strong>
                    </div>
                    <div className="summary-row">
                      <span>Rewards</span>
                      <strong>{rewards.toFixed(2)} QIE</strong>
                    </div>
                  </div>

                  <div className="summary-section">
                    <h4 className="summary-section-title">Borrowed</h4>
                    <div className="summary-row">
                      <span>QIE Borrowed</span>
                      <div className="summary-value">
                        <strong>{displayState.user.borrowed.toFixed(2)} QIE</strong>
                        <span className="summary-usd">~${(displayState.user.borrowed * qiePrice).toFixed(2)}</span>
                      </div>
                    </div>
                    <div className="summary-row">
                      <span>APY</span>
                      <strong>{displayState.totals.borrowApy.toFixed(2)}%</strong>
                    </div>
                  </div>

                  <div className="summary-section">
                    <h4 className="summary-section-title">Overview</h4>
                    <div className="summary-row">
                      <span>Total Value</span>
                      <strong>${((walletBalance + displayState.user.supplied - displayState.user.borrowed) * qiePrice).toFixed(2)}</strong>
                    </div>
                    <div className="summary-row">
                      <span>Available to Borrow</span>
                      <div className="summary-value">
                        <strong>{(availableToBorrowLive || availableToBorrow || 0).toFixed(2)} QIE</strong>
                        <span className="summary-usd">~${((availableToBorrowLive || availableToBorrow || 0) * qiePrice).toFixed(2)}</span>
                      </div>
                    </div>
                    <div className="summary-row">
                      <span>Net APR</span>
                      <strong>{netApy.toFixed(2)}%</strong>
                    </div>
                    <div className="summary-row">
                      <span>Health Factor</span>
                      <strong>{displayedHealthFactor.toFixed(1)}</strong>
                    </div>
                    <div className="summary-row">
                      <span>Points</span>
                      <strong>{contractData?.points !== undefined && contractData?.points !== null ? contractData.points.toFixed(2) : points.toFixed(2)}</strong>
                    </div>
                    <div className="summary-row">
                      <span>Collateral Enabled</span>
                      <strong>{contractData?.user?.collateralEnabled ? 'Yes' : 'No'}</strong>
                    </div>
                  </div>
          </div>
              </div>
            </>
          )}
        </div>
      )}

      {activePage === 'points' && (
        <section className="card">
          <div className="section-heading">
            <h2>Points Leaderboard</h2>
            <span className="pill neutral">Season 1</span>
          </div>
          <p className="hint">Earn points by supplying and borrowing QIE. Points start at 0 when you connect.</p>
          <div className="leaderboard-table">
            <div className="leaderboard-header">
              <div className="leaderboard-col rank-col">Rank</div>
              <div className="leaderboard-col address-col">Address</div>
              <div className="leaderboard-col points-col">Points</div>
            </div>
            <div className="leaderboard-body">
              {computedLeaderboard.map((entry) => {
                const truncatedAddress = entry.address === 'You' ? 'You' : entry.address
                const isHighlighted = entry.rank === 1
                return (
                  <div key={`${entry.address}-${entry.rank}`} className={`leaderboard-row ${isHighlighted ? 'highlighted' : ''}`}>
                    <div className="leaderboard-col rank-col">{entry.rank}</div>
                    <div className="leaderboard-col address-col">{truncatedAddress}</div>
                    <div className="leaderboard-col points-col">{format(entry.points)}</div>
                  </div>
                )
              })}
            </div>
          </div>
        </section>
      )}

      <footer className="app-footer">
        <div className="footer-left">
          <span>© 2025 QieLend All rights reserved</span>
        </div>
        <div className="footer-right">
          <a href="https://t.me/qielend" target="_blank" rel="noopener noreferrer">Telegram</a>
          <a href="https://twitter.com/qielend" target="_blank" rel="noopener noreferrer">X</a>
          <a href="https://discord.gg/qielend" target="_blank" rel="noopener noreferrer">Discord</a>
          <a href="https://github.com/thestatisticia/QieLend" target="_blank" rel="noopener noreferrer">GitHub</a>
          <a href="/DOCS.md" target="_blank" rel="noopener noreferrer" className="docs-link">
            <span>📖</span> Docs
          </a>
        </div>
      </footer>
    </div>
  )
}

export default App


