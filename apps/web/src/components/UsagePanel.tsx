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
  return (
    <section className="usage-panel">
      <span className="eyebrow">Usage</span>
      <UsageBlock title="This analysis" usage={run ?? EMPTY_USAGE} />
      <UsageBlock title="This session" usage={session} />
      <p className="hint">
        ${USD_PER_MILLION_INPUT_TOKENS} per 1M input tokens. Output tokens are free. Failed requests are not counted.
      </p>
    </section>
  );
}

function UsageBlock({ title, usage }: { title: string; usage: TokenUsage }) {
  return (
    <section className="usage-block">
      <h2>{title}</h2>
      <dl>
        <dt>Input tokens</dt>
        <dd>{usage.inputTokens.toLocaleString()}</dd>
        <dt>Output tokens</dt>
        <dd>{usage.outputTokens.toLocaleString()} (free)</dd>
        <dt>Estimated cost</dt>
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
