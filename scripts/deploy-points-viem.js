import { createWalletClient, createPublicClient, http, formatEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import solc from 'solc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const RPC_URL = process.env.RPC_URL || 'https://rpc1mainnet.qie.digital/';
const PRIVATE_KEY = process.env.PRIVATE_KEY || '';

if (!PRIVATE_KEY) {
  throw new Error('PRIVATE_KEY environment variable is required');
}

function compilePointsCalculator() {
  const contractPath = join(__dirname, '../contracts/PointsCalculator.sol');
  const contractSource = readFileSync(contractPath, 'utf8');

  const input = {
    language: 'Solidity',
    sources: {
      'PointsCalculator.sol': {
        content: contractSource,
      },
    },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: { '*': { '*': ['abi', 'evm.bytecode'] } },
    },
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  if (output.errors?.length) {
    const errors = output.errors.filter((e) => e.severity === 'error');
    if (errors.length) throw new Error(errors.map((e) => e.formattedMessage).join('\n'));
  }

  const contract = output.contracts['PointsCalculator.sol']['PointsCalculator'];
  return { abi: contract.abi, bytecode: contract.evm.bytecode.object };
}

async function deploy() {
  console.log('🚀 Deploying PointsCalculator with viem\n');

  const { abi, bytecode } = compilePointsCalculator();
  console.log('✅ Compiled PointsCalculator\n');

  const account = privateKeyToAccount(`0x${PRIVATE_KEY}`);
  console.log('👤 Deployer:', account.address);

  const publicClient = createPublicClient({ transport: http(RPC_URL) });
  const walletClient = createWalletClient({ account, transport: http(RPC_URL) });

  const balance = await publicClient.getBalance({ address: account.address });
  console.log('💰 Balance:', formatEther(balance), 'QIE');
  if (balance === 0n) throw new Error('Insufficient balance for deployment');

  const hash = await walletClient.deployContract({
    abi,
    bytecode: `0x${bytecode}`,
    args: [],
  });

  console.log('⏳ Tx sent:', hash);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  const contractAddress = receipt.contractAddress;
  if (!contractAddress) throw new Error('Deployment failed: no contract address in receipt');

  console.log('✅ PointsCalculator deployed at:', contractAddress);
  console.log('🔗 Explorer:', `https://mainnet.qie.digital/address/${contractAddress}`);

  // Persist ABI for frontend
  const abiPath = join(__dirname, '../src/contracts/PointsCalculatorABI.json');
  writeFileSync(abiPath, JSON.stringify(abi, null, 2));
  console.log('📝 ABI saved to', abiPath);

  return { contractAddress, txHash: hash, deployer: account.address };
}

deploy()
  .then((info) => {
    console.log('\nDeployment info:\n', JSON.stringify(info, null, 2));
    console.log('\nNext steps: set VITE_POINTS_CALCULATOR_ADDRESS=' + info.contractAddress);
  })
  .catch((err) => {
    console.error('❌ Deployment failed:', err);
    process.exit(1);
  });

