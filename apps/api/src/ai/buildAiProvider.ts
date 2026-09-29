import { AiUnavailableError, type AiProvider } from './aiProvider.js';
import type { AiConfig } from '../config/env.js';
import { createMockAiProvider } from './mockAiProvider.js';
import { createOpenAiCompatibleProvider } from './openAiCompatibleProvider.js';
import type { ReadVocabulary } from './mockAiProvider.js';

/**
 * Choosing the implementation, once, at start-up.
 *
 * ## The only place in the codebase that reads `AiConfig`
 *
 * Everything downstream takes an `AiProvider`. A route, a test, a future second provider —
 * none of them know whether an LLM exists. That is the whole point of the port, and this
 * function is where it is cashed in: adding a provider is a line in the `switch` and a new
 * file, with no other file changed.
 *
 * ## Why the vocabulary is a parameter
 *
 * Both implementations need the intake vocabulary, and both get it from the database rather
 * than from a constant. That is not tidiness — it is what makes "unknown keys are rejected"
 * true rather than aspirational. A term renamed in the seed is rejected on the next start
 * without a line of code changing, and a term that exists is accepted without a line of
 * code being written.
 *
 * The cost is that this cannot be called before the database is reachable, so the routes
 * take a provider as a dependency and `app.ts` builds it once the stores exist. See
 * `buildAiProvider` in `app.ts`.
 */
export function buildAiProvider(config: AiConfig, readVocabulary: ReadVocabulary): AiProvider {
  switch (config.provider) {
    case 'openai-compatible':
      return createOpenAiCompatibleProvider(
        {
          baseUrl: config.baseUrl,
          model: config.model,
          apiKey: config.apiKey,
          timeoutMs: config.timeoutMs,
        },
        readVocabulary,
      );

    case 'mock':
      return createMockAiProvider(readVocabulary);
  }
}

/**
 * A provider that is honestly unavailable.
 *
 * Used when the store cannot be reached, so the AI routes answer `503` with a sentence
 * rather than failing because a vocabulary read threw somewhere unexpected. It refuses in
 * the same way a real provider refuses, so the interface's failure path is the one it would
 * have taken anyway.
 */
export function createUnavailableAiProvider(): AiProvider {
  // A *real* `AiUnavailableError`, not an `Error` with that name. The route narrows on
  // `instanceof`, so a look-alike would answer a 500 and tell a person the service is
  // broken, when what has actually happened is that the assistant is switched off.
  //
  // **Rejected, not thrown.** A `Promise.reject` survives a caller that attaches a
  // `.catch()`; a synchronous throw from an `async` function's replacement would not, and a
  // port whose methods can throw synchronously is a trap for whoever wires the next one up.
  const refuse = (): Promise<never> => Promise.reject(new AiUnavailableError('unconfigured'));

  return {
    name: 'unavailable',
    available: false,
    nextTurn: refuse,
    extractSignals: refuse,
    summariseCase: refuse,
  };
}
