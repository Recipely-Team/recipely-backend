const PINTEREST_HOST = /(^|\.)pinterest\.[a-z.]+$|^pin\.it$/i;
const PIN_LINK = /"link":("https?:\/\/[^"]+")/g;

/** Whether a host is Pinterest's (any country domain, or the pin.it short link). */
export const isPinterestHost = (host: string): boolean => PINTEREST_HOST.test(host);

/**
 * The site a pin points at, or `null` for a pin with no outside link.
 *
 * @remarks
 * A recipe pin is almost always a picture of a dish that links to the blog it
 * came from; the page embeds that link as `"link":"https://…"` in its data.
 * The recipe itself lives on the blog, so that is what gets imported. The
 * value is a JSON string, so it is parsed as one (`&` and friends), and
 * a link back to Pinterest itself is skipped.
 */
export const pinSourceLink = (html: string): string | null => {
  for (const match of html.matchAll(PIN_LINK)) {
    let link: string;
    try {
      link = JSON.parse(match[1]!) as string;
    } catch {
      continue;
    }
    try {
      if (!isPinterestHost(new URL(link).hostname)) return link;
    } catch {
      continue;
    }
  }
  return null;
};
