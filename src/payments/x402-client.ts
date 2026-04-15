import { sendUSDC } from "./polygon.js";

export interface X402PaymentInstruction {
  network: "polygon";
  token: "USDC";
  amount: number;
  recipient: string;
}

export function parsePaymentInstruction(body: unknown): X402PaymentInstruction | null {
  if (!body || typeof body !== "object") {
    return null;
  }

  const value = body as Record<string, unknown>;
  if (
    value.network !== "polygon" ||
    value.token !== "USDC" ||
    typeof value.amount !== "number" ||
    value.amount <= 0 ||
    typeof value.recipient !== "string"
  ) {
    return null;
  }

  return {
    network: "polygon",
    token: "USDC",
    amount: value.amount,
    recipient: value.recipient,
  };
}

export async function x402Fetch(
  input: string | URL | Request,
  init?: RequestInit,
): Promise<Response> {
  const originalRequest = input instanceof Request ? input : new Request(input, init);
  const retryableRequest = originalRequest.clone();
  const response = await fetch(originalRequest);

  if (response.status !== 402) {
    return response;
  }

  const body = await response.clone().json().catch(async () => {
    const text = await response.clone().text().catch(() => "");
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  });

  const instruction = parsePaymentInstruction(body);
  if (!instruction) {
    return response;
  }

  const txHash = await sendUSDC(instruction.recipient, instruction.amount);
  const headers = new Headers(retryableRequest.headers);
  headers.set("X-Payment", txHash);

  return fetch(new Request(retryableRequest, { headers }));
}