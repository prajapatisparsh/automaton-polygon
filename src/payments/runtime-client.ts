import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ulid } from "ulid";
import type {
  RuntimeClient,
  CreateSandboxOptions,
  CreditTransferResult,
  DnsRecord,
  DomainRegistration,
  DomainSearchResult,
  ExecResult,
  ModelInfo,
  PortInfo,
  PricingTier,
  SandboxInfo,
} from "../types.js";
import { getWalletAddress } from "../identity/wallet.js";
import { getUSDCBalance, sendUSDC, toUsdcCents } from "./polygon.js";

const DEFAULT_MODELS: ModelInfo[] = [
  {
    id: "gemma4:e4b",
    provider: "ollama",
    pricing: { inputPerMillion: 0, outputPerMillion: 0 },
  },
  {
    id: "glm-5.1",
    provider: "glm",
    pricing: { inputPerMillion: 200, outputPerMillion: 800 },
  },
];

function shellForCurrentPlatform(): string {
  return process.platform === "win32" ? "powershell.exe" : "/bin/sh";
}

function shellArgs(command: string): string[] {
  return process.platform === "win32"
    ? ["-NoProfile", "-Command", command]
    : ["-lc", command];
}

function resolveRuntimePath(filePath: string): string {
  const homeDir = process.env.HOME || os.homedir();
  const normalized = filePath.replace(/\\/g, "/");

  if (normalized === "~") {
    return homeDir;
  }

  if (normalized.startsWith("~/")) {
    return path.join(homeDir, normalized.slice(2));
  }

  if (normalized === "/root" || normalized.startsWith("/root/")) {
    return path.join(homeDir, normalized.slice("/root".length));
  }

  if (normalized === "/tmp" || normalized.startsWith("/tmp/")) {
    return path.join(os.tmpdir(), normalized.slice("/tmp".length));
  }

  return path.isAbsolute(filePath)
    ? filePath
    : path.resolve(process.cwd(), filePath);
}

async function runLocalCommand(command: string, timeout = 30_000): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(shellForCurrentPlatform(), shellArgs(command), {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      resolve({
        stdout,
        stderr: `${stderr}\nCommand timed out after ${timeout}ms: ${command}`.trim(),
        exitCode: 124,
      });
    }, timeout);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });

    child.on("close", (exitCode) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode: exitCode ?? 0 });
    });
  });
}

async function getBalanceCents(): Promise<number> {
  const walletAddress = getWalletAddress();
  if (!walletAddress) return 0;
  const balance = await getUSDCBalance(walletAddress);
  return toUsdcCents(balance);
}

export function createLocalRuntimeClient(options?: {
  runtimeId?: string;
  models?: ModelInfo[];
}): RuntimeClient {
  const runtimeId = options?.runtimeId || `local-${ulid()}`;
  const models = options?.models || DEFAULT_MODELS;

  const client: RuntimeClient = {
    exec: (command: string, timeout?: number) => runLocalCommand(command, timeout),
    async writeFile(filePath: string, content: string): Promise<void> {
      const resolvedPath = resolveRuntimePath(filePath);
      await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
      await fs.writeFile(resolvedPath, content, "utf8");
    },
    readFile: (filePath: string) => fs.readFile(resolveRuntimePath(filePath), "utf8"),
    async exposePort(port: number): Promise<PortInfo> {
      return {
        port,
        publicUrl: `http://127.0.0.1:${port}`,
        runtimeId,
      };
    },
    async removePort(_port: number): Promise<void> {
      return;
    },
    async createSandbox(_options: CreateSandboxOptions): Promise<SandboxInfo> {
      return {
        id: `local-${ulid()}`,
        status: "local",
        region: process.platform,
        vcpu: 1,
        memoryMb: 1024,
        diskGb: 10,
        createdAt: new Date().toISOString(),
      };
    },
    async deleteSandbox(_runtimeId: string): Promise<void> {
      return;
    },
    async listSandboxes(): Promise<SandboxInfo[]> {
      return [];
    },
    getCreditsBalance: () => getBalanceCents(),
    async getCreditsPricing(): Promise<PricingTier[]> {
      return [
        {
          name: "polygon-local-runtime",
          vcpu: 1,
          memoryMb: 1024,
          diskGb: 10,
          monthlyCents: 0,
        },
      ];
    },
    async transferCredits(
      toAddress: string,
      amountCents: number,
      _note?: string,
    ): Promise<CreditTransferResult> {
      const transferId = await sendUSDC(toAddress, amountCents / 100);
      return {
        transferId,
        status: "confirmed",
        toAddress,
        amountCents,
        balanceAfterCents: await getBalanceCents(),
      };
    },
    async registerAutomaton(params) {
      return { automaton: { ...params, runtimeId } };
    },
    async searchDomains(_query: string, _tlds?: string): Promise<DomainSearchResult[]> {
      return [];
    },
    async registerDomain(domain: string, _years?: number): Promise<DomainRegistration> {
      return { domain, status: "unsupported" };
    },
    async listDnsRecords(_domain: string): Promise<DnsRecord[]> {
      return [];
    },
    async addDnsRecord(
      _domain: string,
      type: string,
      host: string,
      value: string,
      ttl?: number,
    ): Promise<DnsRecord> {
      return { id: ulid(), type, host, value, ttl };
    },
    async deleteDnsRecord(_domain: string, _recordId: string): Promise<void> {
      return;
    },
    async listModels(): Promise<ModelInfo[]> {
      return models;
    },
    createScopedClient(targetRuntimeId: string): RuntimeClient {
      return createLocalRuntimeClient({ runtimeId: targetRuntimeId, models });
    },
  };

  return client;
}