import { en, type Messages } from "./en.ts";

/** An error the app raises itself, shown in the chosen language; `message` holds the English wording. */
export class LocalizedError extends Error {
  readonly describe: (messages: Messages) => string;

  constructor(describe: (messages: Messages) => string) {
    super(describe(en));
    this.describe = describe;
  }
}

/** A thrown value's message in the chosen language; errors from elsewhere (the API, pdf.js) keep their own wording. */
export function describeError(error: unknown, messages: Messages): string {
  if (error instanceof LocalizedError) return error.describe(messages);
  return error instanceof Error ? error.message : String(error);
}
