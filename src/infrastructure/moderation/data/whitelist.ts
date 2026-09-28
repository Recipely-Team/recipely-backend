// Safe words whose normalized/compact form contains a 'substring' rule's
// term. Populated test-driven, from what the substring rules above actually
// collide with — not a general dictionary.
//
// "shitake" — a very common misspelling of "shiitake" (mushroom). The
// correctly-spelled "shiitake" already survives on its own (double "i" breaks
// the "shit" substring match), but the misspelling does not.
//
// "sikisik", "sikistir", "sikismis", "sikisma" — "sıkışık", "sıkıştır",
// "sıkışmış", "sıkışma" (packed tight, squeeze) with the dotless ı folded, as
// substring rules read it; each then holds "sikis". A stuffing step says
// "sarmaları sıkışık dizin" — refused as profanity until these were listed.
export const WHITELIST: readonly string[] = ['shitake', 'sikisik', 'sikistir', 'sikismis', 'sikisma'];
