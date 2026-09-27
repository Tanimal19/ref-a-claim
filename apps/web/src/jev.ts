import { TypeSafeClient, choice } from "@typesafe-ai/sdk";
import type { AnalyzePassage, ModelInfo, StanceResult } from "./types.ts";

// Same-origin path proxied to https://api.typesafe.ai (vite.config.ts in dev, vercel.json in production), because
// TypeSafe's API doesn't allow CORS from other sites.
const API_BASE_URL = "/typesafe";

// Criteria wording follows TypeSafe's citation-check cookbook, which uses the same three-way relation.
const STANCE_QUESTION = choice(
  "How does `passage` relate to `claim`? Read `context`, when present, only to understand `passage`; judge what `passage` itself says.",
  {
    supports: "The passage states the claim or directly implies that it is true",
    refutes: "The passage states the opposite of the claim or implies that it is false",
    unrelated: "The passage does not address what the claim asserts, either way",
  },
);

export type StanceClassifier = ReturnType<typeof createStanceClassifier>;

let cached: { apiKey: string; model?: string; classify: StanceClassifier } | undefined;

/** Reuses one client until the key or model changes. An undefined `model` lets the SDK use `jev-latest`. */
export function stanceClassifierFor(apiKey: string, model: string | undefined): StanceClassifier {
  if (cached?.apiKey !== apiKey || cached.model !== model) {
    cached = { apiKey, model, classify: createStanceClassifier(apiKey, model) };
  }
  return cached.classify;
}

export async function listModels(apiKey: string, signal: AbortSignal): Promise<ModelInfo[]> {
  const models = await createClient(apiKey, undefined).models.list({ signal });
  return models.map(({ name, description }) => ({ name, description }));
}

// Each user brings their own key, which only ever goes to TypeSafe, so running the SDK in the browser is intended.
function createClient(apiKey: string, model: string | undefined) {
  return new TypeSafeClient({
    apiKey,
    baseURL: API_BASE_URL,
    dangerouslyAllowBrowser: true,
    ...(model === undefined ? {} : { defaultModel: model }),
    timeout: 30_000,
  });
}

function createStanceClassifier(apiKey: string, model: string | undefined) {
  const client = createClient(apiKey, model);

  return async function classify(
    claim: string,
    passage: AnalyzePassage,
    signal: AbortSignal,
  ): Promise<StanceResult> {
    const { model, answers, usage } = await client.systemOne(
      {
        state: { claim, ...(passage.context && { context: { ...passage.context } }), passage: passage.text },
        questions: { stance: STANCE_QUESTION },
      },
      { signal },
    );
    const { choice: stance, confidence, probabilities } = answers.stance;
    return {
      passageId: passage.id,
      stance,
      confidence,
      probabilities: {
        supports: probabilities.supports,
        refutes: probabilities.refutes,
        unrelated: probabilities.unrelated,
      },
      model,
      usage: { inputTokens: usage.input_tokens, outputTokens: usage.output_tokens },
    };
  };
}
