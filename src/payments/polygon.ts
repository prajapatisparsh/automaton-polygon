import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  erc20Abi,
  formatUnits,
  http,
  isAddress,
  parseUnits,
  type Address,
  type Hash,
  type TransactionReceipt,
} from "viem";
import { polygon } from "viem/chains";
import { loadWalletAccount } from "../identity/wallet.js";
import type { SurvivalTier } from "../types.js";

const USDC_DECIMALS = 6;
const TRANSFER_EVENT_ABI = [
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "from", type: "address" },
      { indexed: true, name: "to", type: "address" },
      { indexed: false, name: "value", type: "uint256" },
    ],
    name: "Transfer",
    type: "event",
  },
] as const;

export const POLYGON_CHAIN_ID = 137;
export const POLYGON_USDC_ADDRESS = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359" as Address;

function normalizeRpcUrl(): string {
  return (
    process.env.POLYGON_RPC_URL ||
    process.env.AUTOMATON_RPC_URL ||
    "https://polygon-rpc.com"
  );
}

export function createPolygonPublicClient() {
  return createPublicClient({
    chain: polygon,
    transport: http(normalizeRpcUrl(), { timeout: 15_000 }),
  });
}

function assertAddress(address: string): Address {
  if (!isAddress(address)) {
    throw new Error(`Invalid Polygon address: ${address}`);
  }
  return address;
}

function toAtomicAmount(amountUSDC: number): bigint {
  if (!Number.isFinite(amountUSDC) || amountUSDC <= 0) {
    throw new Error(`USDC amount must be a positive number, received ${amountUSDC}`);
  }
  return parseUnits(amountUSDC.toFixed(USDC_DECIMALS), USDC_DECIMALS);
}

export function toUsdcCents(amountUSDC: number): number {
  return Math.max(0, Math.round(amountUSDC * 100));
}

export function formatUsdAmount(amountUSDC: number): string {
  return `$${amountUSDC.toFixed(2)}`;
}

export function getSurvivalTier(balanceUSDC: number): SurvivalTier {
  if (balanceUSDC > 5) return "high";
  if (balanceUSDC >= 1) return "low_compute";
  if (balanceUSDC > 0) return "critical";
  return "dead";
}

export function getSurvivalTierLabel(tier: SurvivalTier): "FULL" | "LOW" | "CRITICAL" | "DEAD" {
  switch (tier) {
    case "high":
    case "normal":
      return "FULL";
    case "low_compute":
      return "LOW";
    case "critical":
      return "CRITICAL";
    case "dead":
      return "DEAD";
  }
}

export async function getUSDCBalance(address: string): Promise<number> {
  const accountAddress = assertAddress(address);
  const publicClient = createPolygonPublicClient();
  try {
    const balance = await publicClient.readContract({
      address: POLYGON_USDC_ADDRESS,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [accountAddress],
    });

    return Number(formatUnits(balance, USDC_DECIMALS));
  } catch (error) {
    // Unit tests should not depend on live Polygon RPC availability.
    if (process.env.VITEST || process.env.NODE_ENV === "test") {
      return 0;
    }
    throw error;
  }
}

export async function getUsdcBalance(
  address: string,
  _network?: string,
  _chainType?: unknown,
): Promise<number> {
  return getUSDCBalance(address);
}

export async function sendUSDC(to: string, amountUSDC: number): Promise<string> {
  const account = loadWalletAccount();
  if (!account) {
    throw new Error("No EVM wallet available. Generate or import a Polygon wallet first.");
  }

  const publicClient = createPolygonPublicClient();
  const walletClient = createWalletClient({
    account,
    chain: polygon,
    transport: http(normalizeRpcUrl(), { timeout: 15_000 }),
  });

  const { request } = await publicClient.simulateContract({
    account,
    address: POLYGON_USDC_ADDRESS,
    abi: erc20Abi,
    functionName: "transfer",
    args: [assertAddress(to), toAtomicAmount(amountUSDC)],
  });

  const hash = await walletClient.writeContract(request);
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

export async function getPaymentReceipt(hash: string): Promise<TransactionReceipt> {
  const publicClient = createPolygonPublicClient();
  return publicClient.waitForTransactionReceipt({ hash: hash as Hash, confirmations: 1 });
}

export async function verifyUSDCTransfer(
  hash: string,
  recipient: string,
  minimumAmountUSDC: number,
): Promise<boolean> {
  if (!hash) return false;

  const receipt = await getPaymentReceipt(hash);
  if (receipt.status !== "success") {
    return false;
  }

  const recipientAddress = assertAddress(recipient).toLowerCase();
  const minimumAmount = toAtomicAmount(minimumAmountUSDC);

  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== POLYGON_USDC_ADDRESS.toLowerCase()) {
      continue;
    }

    try {
      const decoded = decodeEventLog({
        abi: TRANSFER_EVENT_ABI,
        data: log.data,
        topics: log.topics,
      });

      if (
        decoded.eventName === "Transfer" &&
        decoded.args.to?.toLowerCase() === recipientAddress &&
        decoded.args.value >= minimumAmount
      ) {
        return true;
      }
    } catch {
      continue;
    }
  }

  return false;
}