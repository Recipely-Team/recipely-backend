/**
 * Where a finished connect may send the browser back to: the app's own deep
 * links and Recipely's web origins. Anything else is refused at the start —
 * an open redirect on our callback would hand a phishing page our domain.
 */
const ALLOWED_PREFIXES = [
  'recipely://',
  'recipely-dev://',
  'https://recipely.net/',
  'https://www.recipely.net/',
  'https://dev.recipely.net/',
  'http://localhost:',
] as const;

export const isAllowedReturnTo = (url: string): boolean => ALLOWED_PREFIXES.some((prefix) => url.startsWith(prefix));

/** `returnTo` with the outcome appended as query parameters. */
export function withOutcome(returnTo: string, params: Readonly<Record<string, string>>): string {
  const query = new URLSearchParams(params).toString();
  return `${returnTo}${returnTo.includes('?') ? '&' : '?'}${query}`;
}
