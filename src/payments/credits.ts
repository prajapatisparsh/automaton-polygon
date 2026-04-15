import type { FinancialState, SurvivalTier } from "../types.js";
import type { RuntimeClient } from "../types.js";
import { SURVIVAL_THRESHOLDS } from "../types.js";

export async function checkFinancialState(
  conway: RuntimeClient,
  usdcBalance: number,
): Promise<FinancialState> {
  const creditsCents = await conway.getCreditsBalance();

  return {
    creditsCents,
    usdcBalance,
    lastChecked: new Date().toISOString(),
  };
}

export function getSurvivalTier(creditsCents: number): SurvivalTier {
  if (creditsCents > SURVIVAL_THRESHOLDS.high) return "high";
  if (creditsCents > SURVIVAL_THRESHOLDS.low_compute) return "low_compute";
  if (creditsCents > SURVIVAL_THRESHOLDS.critical) return "critical";
  return "dead";
}

export function formatCredits(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}