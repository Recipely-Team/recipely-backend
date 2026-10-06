const LINK_PLACEHOLDER = /\{link\}/g;
/**
 * A scheme, a `www.` host, or a bare domain on a common or abuse-heavy TLD —
 * what a phishing or spam link looks like in a DM. Words joined by a dot
 * ("tarif.Afiyet") are not domains: the suffix must be a real TLD.
 */
const LINK_LIKE =
  /\bhttps?:\/\/|\bwww\.|[\p{L}\p{N}-]+\.(?:com|net|org|info|biz|io|co|me|ly|gl|gg|link|xyz|app|site|online|shop|store|top|click|live|tr|ru|cn|tk|ml|ga|cf|to|tv|cc|su|pw|ws)\b/iu;

/**
 * Whether a creator-written message carries a link other than the recipe's own
 * `{link}` placeholder.
 *
 * Recipely sends these messages to strangers in its own name, so the only link
 * one may carry is the recipe page Recipely fills in itself — anything else
 * would let an account turn the automation into a phishing or spam channel.
 */
export function carriesForeignLink(text: string): boolean {
  return LINK_LIKE.test(text.replace(LINK_PLACEHOLDER, ''));
}
