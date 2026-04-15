/**
 * Inference & Model Strategy — Internal Types
 *
 * Re-exports shared types from types.ts and defines internal constants
 * for the inference routing subsystem.
 */

export type {
  SurvivalTier,
  ModelProvider,
  InferenceTaskType,
  ModelEntry,
  ModelPreference,
  RoutingMatrix,
  InferenceRequest,
  InferenceResult,
  InferenceCostRow,
  ModelRegistryRow,
  ModelStrategyConfig,
  ChatMessage,
} from "../types.js";

import type {
  RoutingMatrix,
  ModelEntry,
  ModelStrategyConfig,
} from "../types.js";

// === Default Retry Policy ===

export const DEFAULT_RETRY_POLICY = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
} as const;

// === Per-Task Timeout Overrides (ms) ===

export const TASK_TIMEOUTS: Record<string, number> = {
  heartbeat_triage: 15_000,
  safety_check: 30_000,
  summarization: 60_000,
  agent_turn: 120_000,
  planning: 120_000,
};

// === Static Model Baseline ===
// Local Gemma is the default path. GLM is optional and only used at FULL tier.

export const STATIC_MODEL_BASELINE: Omit<ModelEntry, "lastSeen" | "createdAt" | "updatedAt">[] = [
  {
    modelId: "gemma4:e4b",
    provider: "ollama",
    displayName: "Gemma 4 E4B",
    tierMinimum: "critical",
    costPer1kInput: 0,
    costPer1kOutput: 0,
    maxTokens: 8192,
    contextWindow: 131072,
    supportsTools: true,
    supportsVision: false,
    parameterStyle: "max_tokens",
    enabled: true,
  },
  {
    modelId: "glm-5.1",
    provider: "glm",
    displayName: "GLM 5.1",
    tierMinimum: "high",
    costPer1kInput: 20,
    costPer1kOutput: 80,
    maxTokens: 8192,
    contextWindow: 128000,
    supportsTools: true,
    supportsVision: false,
    parameterStyle: "max_tokens",
    enabled: true,
  },
];

// === Default Routing Matrix ===
// Maps (tier, taskType) -> ModelPreference with candidate models

export const DEFAULT_ROUTING_MATRIX: RoutingMatrix = {
  high: {
    agent_turn: { candidates: ["glm-5.1", "gemma4:e4b"], maxTokens: 8192, ceilingCents: -1 },
    heartbeat_triage: { candidates: ["gemma4:e4b"], maxTokens: 2048, ceilingCents: 0 },
    safety_check: { candidates: ["glm-5.1", "gemma4:e4b"], maxTokens: 4096, ceilingCents: -1 },
    summarization: { candidates: ["gemma4:e4b"], maxTokens: 4096, ceilingCents: 0 },
    planning: { candidates: ["glm-5.1", "gemma4:e4b"], maxTokens: 8192, ceilingCents: -1 },
  },
  normal: {
    agent_turn: { candidates: ["gemma4:e4b"], maxTokens: 4096, ceilingCents: 0 },
    heartbeat_triage: { candidates: ["gemma4:e4b"], maxTokens: 2048, ceilingCents: 0 },
    safety_check: { candidates: ["gemma4:e4b"], maxTokens: 4096, ceilingCents: 0 },
    summarization: { candidates: ["gemma4:e4b"], maxTokens: 4096, ceilingCents: 0 },
    planning: { candidates: ["gemma4:e4b"], maxTokens: 4096, ceilingCents: 0 },
  },
  low_compute: {
    agent_turn: { candidates: ["gemma4:e4b"], maxTokens: 4096, ceilingCents: 0 },
    heartbeat_triage: { candidates: ["gemma4:e4b"], maxTokens: 1024, ceilingCents: 0 },
    safety_check: { candidates: ["gemma4:e4b"], maxTokens: 2048, ceilingCents: 0 },
    summarization: { candidates: ["gemma4:e4b"], maxTokens: 2048, ceilingCents: 0 },
    planning: { candidates: ["gemma4:e4b"], maxTokens: 2048, ceilingCents: 0 },
  },
  critical: {
    agent_turn: { candidates: ["gemma4:e4b"], maxTokens: 2048, ceilingCents: 0 },
    heartbeat_triage: { candidates: ["gemma4:e4b"], maxTokens: 512, ceilingCents: 0 },
    safety_check: { candidates: ["gemma4:e4b"], maxTokens: 1024, ceilingCents: 0 },
    summarization: { candidates: ["gemma4:e4b"], maxTokens: 1024, ceilingCents: 0 },
    planning: { candidates: [], maxTokens: 0, ceilingCents: 0 },
  },
  dead: {
    agent_turn: { candidates: [], maxTokens: 0, ceilingCents: 0 },
    heartbeat_triage: { candidates: [], maxTokens: 0, ceilingCents: 0 },
    safety_check: { candidates: [], maxTokens: 0, ceilingCents: 0 },
    summarization: { candidates: [], maxTokens: 0, ceilingCents: 0 },
    planning: { candidates: [], maxTokens: 0, ceilingCents: 0 },
  },
};

// === Default Model Strategy Config ===

export const DEFAULT_MODEL_STRATEGY_CONFIG: ModelStrategyConfig = {
  inferenceModel: "gemma4:e4b",
  lowComputeModel: "gemma4:e4b",
  criticalModel: "gemma4:e4b",
  maxTokensPerTurn: 4096,
  hourlyBudgetCents: 0,
  sessionBudgetCents: 0,
  perCallCeilingCents: 0,
  enableModelFallback: true,
  anthropicApiVersion: "2023-06-01",
};
