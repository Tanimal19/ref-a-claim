import { TypeSafeClient, choice, type ChoiceQuestion, type ChoiceResponse } from "@typesafe-ai/sdk";
import type { AnalyzePassage, ClaimStance, ModelInfo, StanceResult } from "./types.ts";

// Same-origin path proxied to https://api.typesafe.ai (vite.config.ts in dev, vercel.json in production), because
// TypeSafe's API doesn't allow CORS from other sites.
const API_BASE_URL = "/typesafe";

// Criteria wording follows TypeSafe's citation-check cookbook, which uses the same three-way relation.
const STANCE_CRITERIA = {
  supports: "The passage states the claim or directly implies that it is true",
  refutes: "The passage states the opposite of the claim or implies that it is false",
  unrelated: "The passage does not address what the claim asserts, either way",
} as const;

const CONTEXT_RULE = "Read `context`, when present, only to understand `passage`; judge what `passage` itself says.";

const SINGLE_CLAIM_QUESTION = choice(`How does \`passage\` relate to \`claim\`? ${CONTEXT_RULE}`, STANCE_CRITERIA);

/** The state key and question name of the `index`th of several claims. */
function claimKey(index: number): string {
  return `claim_${index + 1}`;
}

function claimQuestion(index: number): ChoiceQuestion<typeof STANCE_CRITERIA> {
  const key = claimKey(index);
  return choice(
    `How does \`passage\` relate to \`${key}\`? The claims are parts of one argument: judge against \`${key}\` alone, ` +
      `and read the other claims only to understand its terms. ${CONTEXT_RULE}`,
    STANCE_CRITERIA,
  );
}

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

  /**
   * Asks about all claims in one request. A single claim goes as `claim`, as before claims could be split; several go
   * as `claim_1`, `claim_2`, … with one question each.
   */
  return async function classify(
    claims: readonly string[],
    passage: AnalyzePassage,
    signal: AbortSignal,
  ): Promise<StanceResult> {
    const single = claims.length === 1;
    const claimState = single
      ? { claim: claims[0]! }
      : Object.fromEntries(claims.map((claim, i) => [claimKey(i), claim]));
    const questions: Record<string, ChoiceQuestion<typeof STANCE_CRITERIA>> = single
      ? { stance: SINGLE_CLAIM_QUESTION }
      : Object.fromEntries(claims.map((_, i) => [claimKey(i), claimQuestion(i)]));
    const { model, answers, usage } = await client.systemOne(
      {
        state: { ...claimState, ...(passage.context && { context: { ...passage.context } }), passage: passage.text },
        questions,
      },
      { signal },
    );
    const answerOf = (i: number) => answers[single ? "stance" : claimKey(i)];
    return {
      passageId: passage.id,
      stances: claims.map((_, i) => claimStance(answerOf(i))),
      model,
      usage: { inputTokens: usage.input_tokens, outputTokens: usage.output_tokens },
    };
  };
}

function claimStance(answer: ChoiceResponse<typeof STANCE_CRITERIA> | undefined): ClaimStance {
  if (!answer) throw new Error("The model's response is missing an answer for one of the claims.");
  const { choice: stance, confidence, probabilities } = answer;
  return {
    stance,
    confidence,
    probabilities: {
      supports: probabilities.supports,
      refutes: probabilities.refutes,
      unrelated: probabilities.unrelated,
    },
  };
}
