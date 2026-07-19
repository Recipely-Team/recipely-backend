// Safe words whose normalized/compact form contains a 'substring' rule's
// term. Populated test-driven, from what the substring rules above actually
// collide with — not a general dictionary.
//
// "shitake" — a very common misspelling of "shiitake" (mushroom). The
// correctly-spelled "shiitake" already survives on its own (double "i" breaks
// the "shit" substring match), but the misspelling does not.
export const WHITELIST: readonly string[] = ['shitake'];
