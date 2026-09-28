import type { AiMessage } from '../api/ai';

/**
 * Where the conversation lives between page loads.
 *
 * ## sessionStorage, for the same reason the draft is
 *
 * Someone who has described something difficult in their own words should not lose it to a
 * refresh, and should not find it on a shared machine tomorrow. The tab is the right lifetime
 * for both, and using the same store for both means there is one thing to reason about.
 *
 * ## What is stored, precisely
 *
 * An array of `{ role, text }`. No identifiers, no timestamps, no provider name, no
 * suggestions — those are re-derived or re-requested, and a stored suggestion would be a
 * stored *inference about someone*, which is a different kind of thing to leave lying around
 * than a thing they typed.
 *
 * Nothing here is sent anywhere except to this application's own API, on a turn, by an
 * explicit send. There is no background flush, no beacon, and no third party.
 */

const CONVERSATION_KEY = 'wtm.intake.conversation.v1';

/**
 * How long a transcript may get before the oldest turns are dropped.
 *
 * A ceiling on cost and on confusion rather than on privacy: past this point the assistant
 * is answering a conversation nobody can re-read, and the intake questions are the kinder
 * offer. Dropped from the *front*, so the newest turns — the ones being answered — survive.
 */
export const MAX_STORED_MESSAGES = 40;

const ROLES: readonly AiMessage['role'][] = ['user', 'assistant'];

function storage(): Storage | null {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

function read(): string | null {
  try {
    return storage()?.getItem(CONVERSATION_KEY) ?? null;
  } catch {
    return null;
  }
}

function write(value: string): void {
  try {
    storage()?.setItem(CONVERSATION_KEY, value);
  } catch {
    // A conversation that cannot be saved still works in this tab.
  }
}

function remove(): void {
  try {
    storage()?.removeItem(CONVERSATION_KEY);
  } catch {
    // Nothing to do: the value is not there to begin with.
  }
}

function isMessage(value: unknown): value is AiMessage {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Partial<AiMessage>;

  return (
    typeof candidate.role === 'string' &&
    ROLES.includes(candidate.role as AiMessage['role']) &&
    typeof candidate.text === 'string' &&
    candidate.text !== ''
  );
}

/**
 * The saved conversation, or an empty one.
 *
 * Validated on the way in, because storage is not ours: it can be edited, and it can hold a
 * shape from an older version. A malformed entry is dropped rather than trusted, and one bad
 * message does not cost the whole conversation — the rest of it is still what someone typed.
 */
export function loadConversation(): readonly AiMessage[] {
  const stored = read();

  if (stored === null) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(stored);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isMessage).slice(-MAX_STORED_MESSAGES);
  } catch {
    return [];
  }
}

export function saveConversation(messages: readonly AiMessage[]): void {
  if (messages.length === 0) {
    remove();
    return;
  }

  write(JSON.stringify(messages.slice(-MAX_STORED_MESSAGES)));
}

/**
 * Forget the conversation.
 *
 * Called when the intake is sent, alongside `clearIntake`. The answers have left the browser
 * at that point, and a transcript of how someone described their difficulties has no business
 * outliving them.
 */
export function clearConversation(): void {
  remove();
}

/**
 * Add a turn, keeping the transcript under its cap.
 *
 * Returns a new array rather than mutating, so a React state update on the returned value is
 * a change of identity even when the text happens to be identical — which matters for the
 * one case where a retry returns the same reply twice.
 */
export function appendMessage(
  messages: readonly AiMessage[],
  message: AiMessage,
): readonly AiMessage[] {
  return [...messages, message].slice(-MAX_STORED_MESSAGES);
}
