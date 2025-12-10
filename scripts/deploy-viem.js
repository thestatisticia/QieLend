import { createWalletClient, createPublicClient, http, parseEther, formatEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import solc from 'solc';
const { compile } = solc;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// QIE Mainnet configuration
const RPC_URL = 'https://rpc1mainnet.qie.digital/';
const PRIVATE_KEY = process.env.PRIVATE_KEY || '';
if (!PRIVATE_KEY) {
  throw new Error('PRIVATE_KEY environment variable is required');
}
const QIE_TOKEN_ADDRESS = process.env.QIE_TOKEN_ADDRESS || '0x0000000000000000000000000000000000000000';

// Compile Solidity contract
function compileContract() {
  console.log('📦 Compiling QieLend contract...\n');
  
  const contractPath = join(__dirname, '../contracts/QieLend.sol');
  const contractSource = readFileSync(contractPath, 'utf8');
  
  const input = {
    language: 'Solidity',
    sources: {
      'QieLend.sol': {
        content: contractSource,
      },
    },
    settings: {
      outputSelection: {
        '*': {
          '*': ['abi', 'evm.bytecode'],
        },
      },
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  };
  
  try {
    const output = JSON.parse(compile(JSON.stringify(input)));
    
    if (output.errors) {
      const errors = output.errors.filter(e => e.severity === 'error');
      if (errors.length > 0) {
        throw new Error(`Compilation errors:\n${errors.map(e => e.formattedMessage).join('\n')}`);
      }
    }
    
    const contract = output.contracts['QieLend.sol']['QieLend'];
    return {
      abi: contract.abi,
      bytecode: contract.evm.bytecode.object,
    };
  } catch (error) {
    console.error('❌ Compilation failed:', error.message);
    throw error;
  }
}

async function deploy() {
  console.log('🚀 QieLend Deployment Script (using Viem)\n');
  
  try {
    // Compile contract
    const { abi, bytecode } = compileContract();
    console.log('✅ Contract compiled successfully\n');
    
    // Create account from private key
    const account = privateKeyToAccount(`0x${PRIVATE_KEY}`);
    console.log('👤 Deployer address:', account.address);
    
    // Create public client for reading
    const publicClient = createPublicClient({
      transport: http(RPC_URL),
    });
    
    // Create wallet client for transactions
    const walletClient = createWalletClient({
      account,
      transport: http(RPC_URL),
    });
    
    // Check balance
    const balance = await publicClient.getBalance({ address: account.address });
    console.log('💰 Balance:', formatEther(balance), 'QIE\n');
    
    if (balance === 0n) {
      throw new Error('Insufficient balance for deployment');
    }
    
    // Deploy contract
    console.log('📦 Deploying QieLend contract...');
    console.log('   QIE Token Address:', QIE_TOKEN_ADDRESS === '0x0000000000000000000000000000000000000000' ? 'Will deploy QIEToken first' : QIE_TOKEN_ADDRESS);
    
    let qieTokenAddress = QIE_TOKEN_ADDRESS;
    
    // If QIE token address is not set, deploy QIEToken first
    if (QIE_TOKEN_ADDRESS === '0x0000000000000000000000000000000000000000') {
      console.log('\n📦 Deploying QIEToken first...');
      const qieTokenPath = join(__dirname, '../contracts/QIEToken.sol');
      const qieTokenSource = readFileSync(qieTokenPath, 'utf8');
      
      const qieTokenInput = {
        language: 'Solidity',
        sources: {
          'QIEToken.sol': {
            content: qieTokenSource,
          },
        },
        settings: {
          outputSelection: {
            '*': {
              '*': ['abi', 'evm.bytecode'],
            },
          },
        },
      };
      
      const qieTokenOutput = JSON.parse(compile(JSON.stringify(qieTokenInput)));
      const qieTokenContract = qieTokenOutput.contracts['QIEToken.sol']['QIEToken'];
      
      const qieTokenHash = await walletClient.deployContract({
        abi: qieTokenContract.abi,
        bytecode: `0x${qieTokenContract.evm.bytecode.object}`,
        args: [],
      });
      
      console.log('⏳ QIEToken transaction sent:', qieTokenHash);
      
      // Wait for transaction
      const qieTokenReceipt = await publicClient.waitForTransactionReceipt({ hash: qieTokenHash });
      qieTokenAddress = qieTokenReceipt.contractAddress;
      console.log('✅ QIEToken deployed to:', qieTokenAddress, '\n');
    }
    
    // Deploy QieLend
    const hash = await walletClient.deployContract({
      abi: abi,
      bytecode: `0x${bytecode}`,
      args: [qieTokenAddress],
    });
    
    console.log('⏳ Transaction sent, waiting for confirmation...');
    console.log('   Tx hash:', hash);
    
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    const contractAddress = receipt.contractAddress;
    
    if (!contractAddress) {
      throw new Error('Contract deployment failed - no contract address in receipt');
    }
    
    console.log('\n✅ QieLend deployed successfully!');
    console.log('📍 Contract Address:', contractAddress);
    if (qieTokenAddress !== QIE_TOKEN_ADDRESS) {
      console.log('📍 QIEToken Address:', qieTokenAddress);
    }
    console.log('🔗 Explorer:', `https://mainnet.qie.digital/address/${contractAddress}\n`);
    
    // Save ABI
    const abiPath = join(__dirname, '../src/contracts/QieLendABI.json');
    writeFileSync(abiPath, JSON.stringify(abi, null, 2));
    console.log('✅ ABI saved to src/contracts/QieLendABI.json\n');
    
    // Deployment info
    const deploymentInfo = {
      qieLendAddress: contractAddress,
      qieTokenAddress: qieTokenAddress,
      deployer: account.address,
      network: 'QIE Mainnet',
      rpcUrl: RPC_URL,
      deployedAt: new Date().toISOString(),
      txHash: hash,
    };
    
    console.log('📋 Deployment Information:');
    console.log(JSON.stringify(deploymentInfo, null, 2));
    console.log('\n⚠️  SECURITY: Remove private key from this file now!\n');
    console.log('📝 Next steps:');
    console.log('   1. Update .env file: VITE_QIE_CONTRACT_ADDRESS=' + contractAddress);
    console.log('   2. Update .env file: VITE_QIE_TOKEN_ADDRESS=' + qieTokenAddress);
    console.log('   3. Remove PRIVATE_KEY from .env file');
    console.log('   4. Test the integration in the frontend\n');
    
    return deploymentInfo;
    
  } catch (error) {
    console.error('❌ Deployment failed:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    throw error;
  }
}

deploy().catch((error) => {
  console.error(error);
  process.exit(1);
});

