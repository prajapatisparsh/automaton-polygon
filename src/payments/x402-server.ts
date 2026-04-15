import { verifyUSDCTransfer } from "./polygon.js";

export interface PaymentRequiredPayload {
  network: "polygon";
  token: "USDC";
  amount: number;
  recipient: string;
}

export interface X402MiddlewareOptions {
  amount: number | ((requestLike: unknown) => number | Promise<number>);
  recipient?: string;
}

function resolveRecipient(explicitRecipient?: string): string {
  const recipient = explicitRecipient || process.env.AGENT_WALLET_ADDRESS;
  if (!recipient) {
    throw new Error("AGENT_WALLET_ADDRESS must be configured for x402 settlement");
  }
  return recipient;
}

async function resolveAmount(
  source: X402MiddlewareOptions["amount"],
  requestLike: unknown,
): Promise<number> {
  const amount = typeof source === "function" ? await source(requestLike) : source;
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`Invalid x402 amount: ${amount}`);
  }
  return amount;
}

function buildPayload(amount: number, recipient: string): PaymentRequiredPayload {
  return {
    network: "polygon",
    token: "USDC",
    amount,
    recipient,
  };
}

function readExpressHeader(request: any, name: string): string | undefined {
  const direct = request?.headers?.[name.toLowerCase()];
  if (typeof direct === "string") return direct;
  if (Array.isArray(direct)) return direct[0];
  const viaHelper = request?.header?.(name);
  return typeof viaHelper === "string" ? viaHelper : undefined;
}

export function createExpressX402Middleware(options: X402MiddlewareOptions) {
  return async (req: any, res: any, next: () => Promise<unknown> | unknown): Promise<unknown> => {
    const recipient = resolveRecipient(options.recipient);
    const amount = await resolveAmount(options.amount, req);
    const txHash = readExpressHeader(req, "X-Payment");

    if (!txHash || !(await verifyUSDCTransfer(txHash, recipient, amount))) {
      return res.status(402).json(buildPayload(amount, recipient));
    }

    return next();
  };
}

export function createHonoX402Middleware(options: X402MiddlewareOptions) {
  return async (context: any, next: () => Promise<unknown>): Promise<unknown> => {
    const recipient = resolveRecipient(options.recipient);
    const amount = await resolveAmount(options.amount, context);
    const txHash = context.req.header("X-Payment");

    if (!txHash || !(await verifyUSDCTransfer(txHash, recipient, amount))) {
      return context.json(buildPayload(amount, recipient), 402);
    }

    return next();
  };
}