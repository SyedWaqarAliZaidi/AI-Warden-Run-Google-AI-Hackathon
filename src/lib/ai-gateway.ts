import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

export const createAntigravityProvider = (apiKey: string) =>
  createOpenAICompatible({
    name: "antigravity",
    baseURL: "https://generativelanguage.googleapis.com/v1beta2/models",
    headers: {
      "X-API-Key": apiKey,
      "X-Antigravity-SDK": "google-antigravity",
    },
  });