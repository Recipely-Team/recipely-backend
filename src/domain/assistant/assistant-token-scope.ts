/**
 * What a bearer token is allowed to be used for.
 *
 * @remarks
 * A session JWT carries no scope at all, and that absence is the contract: it
 * is what lets `JwtTokenSigner.verify` refuse every scoped token without
 * knowing which scopes exist. So this vocabulary names only the narrow ones.
 *
 * The reason it exists: the OS-assistant path writes a token into a container
 * the phone's assistant can read (iOS App Group, Android preferences), which is
 * a wider audience than the app's own keychain. A token readable from there
 * must buy strictly less than a session does — the assistant's typed turn and
 * nothing else — or a leaked one would be an account.
 */
export const AssistantTokenScope = {
  /** Answers one assistant question. Cannot mint Live sessions or spend budget. */
  Intent: 'assistantIntent',
} as const;

export type AssistantTokenScopeType = (typeof AssistantTokenScope)[keyof typeof AssistantTokenScope];
