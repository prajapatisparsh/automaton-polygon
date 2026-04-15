# Session Handoff

## Scope

This session migrated automaton-polygon away from Conway-hosted runtime dependencies toward a Polygon USDC treasury model plus local inference.

Primary target state:

- Remove Conway runtime/payment/inference dependencies from the active code path.
- Use Polygon mainnet USDC as the treasury source of truth.
- Use Ollama with `gemma4:e4b` as the default inference backend.
- Allow optional FULL-tier upgrade to `glm-5.1` when `GLM_API_KEY` is present.
- Preserve enough compatibility surface to avoid a full repo-wide type rename in one pass.

## GitNexus Status

GitNexus CLI status was checked during handoff preparation.

- Repository: `automaton-polygon`
- Indexed commit: `226c1e9`
- Current commit: `226c1e9`
- Status: up to date

GitNexus MCP from this chat agent was not usable because the browser side was not connected, so repo-aware context for this handoff was assembled from:

- GitNexus CLI status
- git diff / changed files
- direct source inspection of the touched runtime files

## What Changed

### 1. Payment and runtime layer replaced Conway

New files added under `src/payments/`:

- `src/payments/polygon.ts`
  - Polygon USDC read/transfer/receipt verification helpers
  - Chain id fixed to 137
  - Treasury thresholds implemented in USDC terms
- `src/payments/runtime-client.ts`
  - Local runtime implementation that preserves the existing `ConwayClient`-shaped interface
  - Local exec, file IO, port exposure, model listing, and treasury-backed balance/transfer methods
- `src/payments/http-client.ts`
  - Resilient HTTP client moved out of deleted Conway layer
- `src/payments/x402-client.ts`
  - Client-side x402 flow using Polygon USDC settlement
- `src/payments/x402-server.ts`
  - Express/Hono middleware for Polygon-backed x402 payment verification
- `src/payments/credits.ts`
  - Cents-based compatibility helper for legacy callers that still reason in `creditsCents`

Deleted old Conway payment/runtime files:

- `src/conway/client.ts`
- `src/conway/credits.ts`
- `src/conway/http-client.ts`
- `src/conway/inference.ts`
- `src/conway/topup.ts`
- `src/conway/x402.ts`
- the rest of `src/conway/`

### 2. Inference stack changed to Ollama + GLM only

New file:

- `src/inference/client.ts`
  - Default backend is Ollama
  - GLM is selected only when the model/provider resolves to GLM and `GLM_API_KEY` is set

Updated inference files:

- `src/inference/types.ts`
  - Static model baseline replaced with `gemma4:e4b` and `glm-5.1`
  - Routing matrix rewritten around local Gemma plus optional GLM
  - Default strategy config now points at `gemma4:e4b`
- `src/inference/router.ts`
  - FULL tier prefers `glm-5.1` when enabled
  - Other tiers prefer Ollama models
  - `dead` now returns no model
- `src/inference/registry.ts`
  - Registry comments and provider fallback generalized away from Conway

### 3. Bootstrap and setup flow rewired for local runtime

Updated:

- `src/index.ts`
  - Removed provisioning command path and Conway client bootstrap
  - Swapped in `createLocalRuntimeClient()`
  - Swapped in new `createInferenceClient()`
  - Removed bootstrap top-up behavior
  - Runtime/help/status text changed from sandbox wording to local runtime wording
- `src/config.ts`
  - Removed provisioning-key load path
  - Normalizes runtime id
  - Defaults now favor local runtime, Ollama, and Polygon RPC
- `src/setup/wizard.ts`
  - Setup now assumes Polygon mainnet EVM wallet flow
  - Removed Conway SIWE provisioning flow
  - Setup asks for Ollama URL and describes optional GLM env-based upgrade
- `src/setup/configure.ts`
  - Removed Conway/OpenAI/Anthropic interactive provider prompts from the main flow here
  - Focused provider config on Ollama URL and GLM env note
- `src/setup/defaults.ts`
  - Default skill content rewritten to local compute / polygon payments language
- `src/setup/environment.ts`
  - Environment detection now yields local runtime ids instead of Conway sandbox ids
- `src/setup/model-picker.ts`
  - Provider label updated to include GLM rather than Conway

Deleted:

- `src/identity/provision.ts`

Updated identity:

- `src/identity/wallet.ts`
  - EVM wallet data now records Polygon chain id 137

### 4. Survival and heartbeat now use Polygon treasury semantics

Updated:

- `src/survival/monitor.ts`
  - Financial state now derives from Polygon USDC
  - Runtime is assumed healthy locally instead of probing Conway sandbox health
- `src/survival/funding.ts`
  - Funding notices now reference Polygon funding instead of Conway credit transfers
- `src/survival/low-compute.ts`
  - Transition data renamed conceptually to treasury
  - Low/critical fallback model switched to `gemma4:e4b`
- `src/heartbeat/tick-context.ts`
  - Tick context now reads USDC balance and converts to treasury cents once per tick
- `src/heartbeat/tasks.ts`
  - Removed auto-topup/bootstrap-topup logic
  - Dead state now happens when treasury reaches zero
  - Distress/funding messaging now refers to Polygon treasury

Threshold semantics now effectively are:

- FULL: > $5 USDC
- LOW: $1 to $5 USDC
- CRITICAL: > $0 and < $1 USDC
- DEAD: $0 USDC

Compatibility note:

- `creditsCents` still exists in several runtime contracts, but it now acts as a treasury-derived compatibility field rather than a separate Conway credit balance.

### 5. Main agent loop and tools were rewired

Updated:

- `src/agent/loop.ts`
  - Imports moved from Conway credits/x402 to `src/payments/credits.ts` and `src/payments/polygon.ts`
  - Orchestration provider bridging now prefers Ollama base URL instead of Conway/OpenAI fallback tricks
  - Sandbox top-up and inline auto-top-up logic removed
  - Financial state reads Polygon USDC and enters `dead` when treasury hits zero
  - Wake logs and survival messages now say treasury instead of credits
- `src/agent/tools.ts`
  - `check_usdc_balance` now reads Polygon directly
  - `topup_credits` repurposed to record a requested external treasury top-up instead of buying Conway credits
  - `transfer_credits` now routes through the runtime payment layer
  - x402 fetch now uses the new payments client
  - child spawn/funding/heartbeat/distress text updated toward runtime + treasury semantics
- `src/agent/system-prompt.ts`
  - Core identity rewritten around local runtime + Polygon + Ollama/GLM
  - Orchestration guidance updated from credit language to treasury language
  - Status block, wakeup prompt, and environment description updated
  - This was the last cleanup pass after the main migration because the prompt still contained Conway-era mental models

### 6. Tests and support imports adjusted

Updated tests:

- `src/__tests__/http-client.test.ts`
  - import moved to `src/payments/http-client.ts`
- `src/__tests__/low-compute.test.ts`
  - inference import moved to `src/inference/client.ts`
  - expected models updated to `gemma4:e4b` and `glm-5.1`

Other support updates:

- `src/social/client.ts`
  - resilient HTTP client import moved to payments layer
- `src/types.ts`
  - config defaults updated
  - `ModelProvider` now includes `glm`
  - survival thresholds updated
  - treasury policy defaults narrowed to localhost-style x402 domains

### 7. Repo structure cleanup

Deleted as requested:

- `src/conway/`
- `packages/`
- `scripts/`
- `pnpm-workspace.yaml`

Updated:

- `package.json`
  - `build` simplified to `tsc`
  - `clean` simplified to local dist cleanup only
- `.gitignore`
  - gitnexus / agent-workflow folders added

### 8. Documentation and AI handoff files added

Added:

- `docs/context.md`
  - GitNexus-friendly codebase context document for future AI handoff
- `docs/index.md`
  - minimal docs index

## Validation Performed

Validated during the session:

- repaired the broken pnpm install state first
- `pnpm exec tsc --noEmit` passed
- `pnpm build` passed
- focused test slice passed after one follow-up fix:
  - `src/__tests__/http-client.test.ts`
  - `src/__tests__/low-compute.test.ts`

One follow-up fix was required during validation:

- `src/payments/http-client.ts`
  - restored `getConsecutiveFailures()` because the migrated tests still depended on it

Non-blocking leftovers at validation time:

- markdown newline warnings in `docs/context.md` and `docs/index.md`
- remaining compatibility naming such as `ConwayClient`, `sandboxId`, and some `category: "conway"` usage still exist in type/contracts for stability

## Final Cleanup Pass Performed After Main Migration

After the main migration and validation were already complete, one more quality pass was made:

- `src/agent/system-prompt.ts`
- `src/agent/tools.ts`

Purpose of that pass:

- stop teaching the agent that it still lives in Conway
- align prompt and tool wording with the actual Polygon/local-runtime implementation
- keep compatibility interfaces intact while removing misleading operator/agent-facing language

## Remaining Refactor Opportunities

These were intentionally not done yet to avoid turning the migration into a risky repo-wide rename:

1. Rename `ConwayClient` and related compatibility types to something neutral like `RuntimeClient`.
2. Rename `sandboxId` fields to `runtimeId` across types, replication, and orchestration.
3. Rename `category: "conway"` tool metadata to a neutral category.
4. Sweep docs/comments/metadata for leftover Conway branding.
5. Clean the docs newline warnings.
6. Run the full Vitest suite, not just the focused migration slice.

## Recommended Entry Files For The Next AI

If another AI continues from here, start with these files:

- `src/index.ts`
- `src/agent/loop.ts`
- `src/payments/polygon.ts`
- `src/payments/runtime-client.ts`
- `src/inference/client.ts`
- `src/heartbeat/tasks.ts`
- `src/agent/tools.ts`
- `src/agent/system-prompt.ts`
- `src/types.ts`
- `docs/context.md`

## Short Status

The requested migration is functionally complete:

- Conway runtime/payment/inference code removed from the active path
- Polygon USDC treasury model installed
- local Ollama + optional GLM inference installed
- setup/bootstrap/runtime rewired
- repo structure cleanup done
- typecheck/build passed

The main thing left is cleanup of compatibility naming, not missing functionality.