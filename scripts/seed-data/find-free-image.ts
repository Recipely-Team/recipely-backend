import https from 'https';

/** Only these two licences require no attribution of any kind. */
const FREE_LICENCES = 'cc0,pdm';
const OPENVERSE = 'https://api.openverse.org/v1/images/';
const USER_AGENT = 'Recipely/1.0 (recipe app; https://recipely.net)';
const CANDIDATES = 8;
const MIN_DIMENSION = 500;
/**
 * Words that mean the photograph is OF the word rather than of the dish.
 *
 * The title gate catches the name and not the sense: "hummus" returned a
 * supermarket tub, and "dolma" a Swedish cavalry jacket — the dolman — because
 * a dish name and a garment share a spelling. A homograph cannot be filtered
 * in general, but the shapes that recur can: packaging, signage, and the
 * `File:` prefix Wikimedia leaves on media pages rather than photographs.
 */
const NOT_A_DISH = [
  'container', 'packaging', 'package', 'packet', 'label', 'logo', 'sign', 'signage',
  'menu board', 'storefront', 'shop front', 'uniform', 'jacket', 'tunic', 'coat',
  'file:', 'museum', 'stamp', 'coin', 'banknote', 'poster',
  // Rooms and cookware, which a dish name attracts as readily as the dish:
  // "shawarma" found a restaurant's Inside Area, and "tagine" the empty pot.
  'inside area', 'interior', 'exterior', 'dining room', 'kitchen view',
  'pot with', 'empty pot', 'cookware', 'old street',
];

export interface FreeImage {
  url: string;
  licence: string;
  source: string;
  openverseId: string;
  title: string;
}

/**
 * Finds a photograph that can be used without attributing anyone.
 *
 * @remarks
 * - **`cc0` and `pdm` only.** CC BY and BY-SA are free too, but they oblige the
 *   app to print a credit beside every card. Filtering them out here is
 *   cheaper than building an attribution surface and remembering to keep it
 *   correct — and quietly using them without the credit is the thing that
 *   actually gets people sued.
 * - **The first result is not taken.** Openverse ranks on text relevance, and
 *   the top hit for a dish is often a logo, a menu board or a 200px thumbnail.
 *   Candidates are filtered on size and the largest usable one wins.
 * - **The query narrows, it does not widen.** Openverse ANDs every term, so
 *   "menemen turkish eggs tomato" matches nothing while "menemen" returns two.
 *   Each attempt drops the last word, so a specific phrase is tried first.
 * - **The subject is given, not guessed.** It was taken as the query's first
 *   word, which is right for "baklava" and wrong for "stuffed grape leaves":
 *   narrowing reduced that to "stuffed" and matched a photograph of a carpenter.
 *   The distinctive word is the caller's to name.
 * - **Every candidate must still NAME the dish.** Narrowing alone was actively
 *   dangerous: it answered "imam bayildi" with a photograph of the Imam Ali
 *   Shrine, and "menemen" with a plate of gnocchi. Openverse ranks on text
 *   relevance and will always hand back its best guess, so the caller has to
 *   decide what counts — here, the subject word must appear in the TITLE.
 * - **Tags are not enough, and the reason is instructive.** Searching
 *   "menemen" returns a plate of gnocchi tagged `menemen`, because the photo
 *   was taken in Menemen, İzmir. A dish name and a place name collide, and a
 *   tag records where a photograph happened as readily as what is in it. A
 *   title is a description; a tag is an index entry.
 * - **Returns null rather than a fallback.** A wrong photograph on a recipe is
 *   worse than none: the card is the only thing most users judge the dish by.
 */
export async function findFreeImage(
  query: string,
  subjectWord?: string,
  exactOnly = false,
): Promise<FreeImage | null> {
  const words = query.trim().split(/\s+/);
  const subject = (subjectWord ?? words[0] ?? '').toLowerCase();

  const shortest = exactOnly ? words.length : 1;

  for (let length = words.length; length >= shortest; length -= 1) {
    const attempt = words.slice(0, length).join(' ');
    // Never narrow past the subject: an attempt that no longer contains it can
    // only match something else, however well it ranks.
    if (!attempt.toLowerCase().includes(subject)) break;
    const found = await search(attempt, subject);
    if (found !== null) return found;
  }
  return null;
}

async function search(query: string, subject: string): Promise<FreeImage | null> {
  const params = new URLSearchParams({
    q: query,
    license: FREE_LICENCES,
    page_size: String(CANDIDATES),
    mature: 'false',
  });

  const body = await get(`${OPENVERSE}?${params.toString()}`);
  const results: unknown = JSON.parse(body).results;
  if (!Array.isArray(results)) return null;

  const usable = results
    .filter((r): r is Record<string, unknown> => typeof r === 'object' && r !== null)
    .filter((r) => typeof r.url === 'string')
    .filter((r) => Number(r.width ?? 0) >= MIN_DIMENSION && Number(r.height ?? 0) >= MIN_DIMENSION)
    .filter((r) => namesTheDish(r, subject))
    .sort((a, b) => Number(b.width ?? 0) - Number(a.width ?? 0));

  const best = usable[0];
  if (best === undefined) return null;

  return {
    url: String(best.url),
    licence: `${String(best.license)} ${String(best.license_version ?? '')}`.trim(),
    source: String(best.foreign_landing_url ?? best.url),
    openverseId: String(best.id ?? ''),
    title: String(best.title ?? query),
  };
}

/** Whether the photograph's own title says it is of `subject`, and of the dish. */
function namesTheDish(result: Record<string, unknown>, subject: string): boolean {
  const title = String(result.title ?? '').toLowerCase();
  if (NOT_A_DISH.some((word) => title.includes(word))) return false;
  if (subject.length === 0) return true;
  return title.includes(subject);
}

function get(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': USER_AGENT }, timeout: 20_000 }, (res) => {
      if ((res.statusCode ?? 0) !== 200) {
        res.resume();
        reject(new Error(`Openverse returned HTTP ${res.statusCode} for ${url}`));
        return;
      }
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error(`Openverse timed out for ${url}`)));
    req.on('error', reject);
  });
}
