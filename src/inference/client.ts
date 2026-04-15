import type {
  InferenceClient,
  ChatMessage,
  InferenceOptions,
  InferenceResponse,
  InferenceToolCall,
  TokenUsage,
} from "../types.js";
import { ResilientHttpClient } from "../payments/http-client.js";

const INFERENCE_TIMEOUT_MS = 60_000;
const DEFAULT_OLLAMA_URL = "http://localhost:11434";
const DEFAULT_GLM_BASE_URL = "https://open.bigmodel.cn/api/paas/v4";

interface InferenceClientOptions {
  defaultModel: string;
  maxTokens: number;
  lowComputeModel?: string;
  ollamaBaseUrl?: string;
  getModelProvider?: (modelId: string) => string | undefined;
}

type InferenceBackend = "ollama" | "glm";

export function createInferenceClient(options: InferenceClientOptions): InferenceClient {
  const httpClient = new ResilientHttpClient({
    baseTimeout: INFERENCE_TIMEOUT_MS,
    retryableStatuses: [429, 500, 502, 503, 504],
  });

  let currentModel = options.defaultModel;
  let maxTokens = options.maxTokens;

  const chat = async (
    messages: ChatMessage[],
    opts?: InferenceOptions,
  ): Promise<InferenceResponse> => {
    const model = opts?.model || currentModel;
    const backend = resolveInferenceBackend(model, options.getModelProvider);
    const apiUrl =
      backend === "glm"
        ? (process.env.GLM_BASE_URL || DEFAULT_GLM_BASE_URL).replace(/\/$/, "")
        : `${(options.ollamaBaseUrl || process.env.OLLAMA_BASE_URL || DEFAULT_OLLAMA_URL).replace(/\/$/, "")}/v1`;
    const apiKey = backend === "glm" ? process.env.GLM_API_KEY : "ollama";

    if (backend === "glm" && !apiKey) {
      throw new Error("GLM_API_KEY must be set before using GLM inference");
    }

    const body: Record<string, unknown> = {
      model,
      messages: messages.map((message) => ({
        role: message.role,
        content: message.content,
        ...(message.name ? { name: message.name } : {}),
        ...(message.tool_calls ? { tool_calls: message.tool_calls } : {}),
        ...(message.tool_call_id ? { tool_call_id: message.tool_call_id } : {}),
      })),
      max_tokens: opts?.maxTokens || maxTokens,
      stream: false,
    };

    if (opts?.temperature !== undefined) {
      body.temperature = opts.temperature;
    }
    if (opts?.tools && opts.tools.length > 0) {
      body.tools = opts.tools;
      body.tool_choice = "auto";
    }

    const response = await httpClient.request(`${apiUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      timeout: INFERENCE_TIMEOUT_MS,
    });

    if (!response.ok) {
      throw new Error(`Inference error (${backend}): ${response.status} ${await response.text()}`);
    }

    const data = (await response.json()) as any;
    const choice = data.choices?.[0];
    if (!choice?.message) {
      throw new Error("No completion choice returned from inference backend");
    }

    const toolCalls: InferenceToolCall[] | undefined = Array.isArray(choice.message.tool_calls)
      ? choice.message.tool_calls.map((toolCall: any) => ({
          id: toolCall.id,
          type: "function",
          function: {
            name: toolCall.function.name,
            arguments: toolCall.function.arguments,
          },
        }))
      : undefined;

    const usage: TokenUsage = {
      promptTokens: data.usage?.prompt_tokens || 0,
      completionTokens: data.usage?.completion_tokens || 0,
      totalTokens: data.usage?.total_tokens || 0,
    };

    return {
      id: data.id || "",
      model: data.model || model,
      message: {
        role: choice.message.role,
        content: choice.message.content || "",
        tool_calls: toolCalls,
      },
      toolCalls,
      usage,
      finishReason: choice.finish_reason || "stop",
    };
  };

  return {
    chat,
    setLowComputeMode(enabled: boolean): void {
      currentModel = enabled
        ? options.lowComputeModel || "gemma4:e4b"
        : options.defaultModel;
      maxTokens = enabled ? Math.min(options.maxTokens, 2048) : options.maxTokens;
    },
    getDefaultModel(): string {
      return currentModel;
    },
  };
}

function resolveInferenceBackend(
  model: string,
  getModelProvider?: (modelId: string) => string | undefined,
): InferenceBackend {
  const provider = getModelProvider?.(model);
  if (provider === "glm") return "glm";
  if (provider === "ollama") return "ollama";
  if (process.env.GLM_API_KEY && /^glm/i.test(model)) return "glm";
  return "ollama";
}