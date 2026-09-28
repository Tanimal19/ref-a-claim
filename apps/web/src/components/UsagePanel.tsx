import { useMessages } from "../i18n/index.tsx";
import type { TokenUsage } from "../types.ts";

// jev-1.13 pricing from https://docs.typesafe.ai/models: input tokens only, output tokens are free.
const USD_PER_MILLION_INPUT_TOKENS = 0.042;

export const EMPTY_USAGE: TokenUsage = { inputTokens: 0, outputTokens: 0 };

export function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return { inputTokens: a.inputTokens + b.inputTokens, outputTokens: a.outputTokens + b.outputTokens };
}

interface Props {
  run?: TokenUsage;
  session: TokenUsage;
}

export function UsagePanel({ run, session }: Props) {
  const m = useMessages();
  return (
    <section className="usage-panel">
      <span className="eyebrow">{m.usage.title}</span>
      <UsageBlock title={m.usage.thisAnalysis} usage={run ?? EMPTY_USAGE} />
      <UsageBlock title={m.usage.thisSession} usage={session} />
      <p className="hint">{m.usage.pricing(USD_PER_MILLION_INPUT_TOKENS)}</p>
    </section>
  );
}

function UsageBlock({ title, usage }: { title: string; usage: TokenUsage }) {
  const m = useMessages();
  return (
    <section className="usage-block">
      <h2>{title}</h2>
      <dl>
        <dt>{m.usage.inputTokens}</dt>
        <dd>{usage.inputTokens.toLocaleString()}</dd>
        <dt>{m.usage.outputTokens}</dt>
        <dd>
          {usage.outputTokens.toLocaleString()} {m.usage.free}
        </dd>
        <dt>{m.usage.estimatedCost}</dt>
        <dd className="cost">{formatUsd((usage.inputTokens / 1_000_000) * USD_PER_MILLION_INPUT_TOKENS)}</dd>
      </dl>
    </section>
  );
}

// Typical runs cost fractions of a cent, so format by significant digits rather than decimals.
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumSignificantDigits: 3 });

function formatUsd(amount: number): string {
  return usd.format(amount);
}
