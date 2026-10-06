const LINK_PLACEHOLDER = /\{link\}/g;
/** Look-alike dots (ideographic, full-width, half-width) and spelled-out dots, read as a real dot. */
const DISGUISED_DOT = /[。．｡]|\[\.\]|\(\.\)|\s+\.\s*(?=[\p{L}\p{N}])/gu;
/** Common generic TLDs; every two-letter (country) TLD is matched by shape instead. */
const GENERIC_TLDS =
  'com|net|org|info|biz|io|ai|app|dev|site|online|shop|store|top|click|live|link|xyz|club|vip|icu|gle|page|blog|tech|today|life|world|fun|win|bid|buzz|cyou|rest|monster|work|email|social|digital|website|space|tk|ml|ga|cf|gq';
/**
 * A scheme, a `www.` host, an IPv4 address, anything shaped `host.tld/path`,
 * a host on any two-letter country TLD, or a host on a common generic TLD —
 * what a phishing or spam link looks like in a DM. Decimals and times
 * ("2.5", "12.30") are digits on both sides and never match; "Afiyet.Olsun"
 * is not a TLD.
 */
const LINK_LIKE = new RegExp(
  [
    String.raw`\b(?:h[xt]{2}ps?|ftp):\/\/`,
    String.raw`\bwww\.`,
    String.raw`\b\d{1,3}(?:\.\d{1,3}){3}\b`,
    String.raw`[\p{L}\p{N}-]+\.\p{L}{2,}\/`,
    String.raw`[\p{L}\p{N}-]+\.[a-z]{2}(?![\p{L}\p{N}])`,
    String.raw`[\p{L}\p{N}-]+\.(?:${GENERIC_TLDS})(?![\p{L}\p{N}])`,
  ].join('|'),
  'iu',
);

/**
 * Whether a creator-written message carries a link other than the recipe's own
 * `{link}` placeholder.
 *
 * Recipely sends these messages to strangers in its own name, so the only link
 * one may carry is the recipe page Recipely fills in itself — anything else
 * would let an account turn the automation into a phishing or spam channel.
 */
export function carriesForeignLink(text: string): boolean {
  return LINK_LIKE.test(text.replace(LINK_PLACEHOLDER, ' ').replace(DISGUISED_DOT, '.'));
}
