import { OpenFoodFactsSearch, type FetchLike } from '@infrastructure/foods/open-food-facts-search';
import { pinoInstance } from '@infrastructure/logger/pino-logger';

const AYRAN = {
  code: '8681324002837', product_name: 'Ayran', brands: ['Sütaş'], quantity: '285 ml',
  nutriments: { 'energy-kcal_100g': 32, proteins_100g: 2, carbohydrates_100g: 2, fat_100g: 1.8 },
};
const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function setup(...answers: Array<Response | Error>): { off: OpenFoodFactsSearch; fetch: jest.Mock } {
  const fetch = jest.fn<ReturnType<FetchLike>, Parameters<FetchLike>>();
  for (const answer of answers) {
    if (answer instanceof Error) fetch.mockRejectedValueOnce(answer);
    else fetch.mockResolvedValueOnce(answer);
  }
  return { off: new OpenFoodFactsSearch('team@recipely.test', fetch as unknown as FetchLike), fetch };
}

const query = (fetch: jest.Mock, call = 0): URLSearchParams => new URL(fetch.mock.calls[call][0] as string).searchParams;

beforeEach(() => jest.spyOn(pinoInstance, 'warn').mockImplementation(() => undefined));
afterEach(() => jest.restoreAllMocks());

describe('OpenFoodFactsSearch.search', () => {
  it('names Recipely and its contact in the User-Agent, as Open Food Facts asks', async () => {
    const { off, fetch } = setup(json({ hits: [AYRAN] }));
    await off.search('ayran', 'tr', 10);
    expect(fetch.mock.calls[0][1].headers['User-Agent']).toBe('Recipely/1.0 (team@recipely.test)');
  });

  it('asks a Turkish user for products sold in Turkey, in Turkish then English, overfetching for the filter', async () => {
    const { off, fetch } = setup(json({ hits: [AYRAN] }));
    const result = await off.search('Ayran', 'tr', 10);
    expect(query(fetch).get('q')).toBe('ayran AND countries_tags:"en:turkey"');
    expect(query(fetch).get('langs')).toBe('tr,en');
    expect(query(fetch).get('page_size')).toBe('20');
    expect(result.ok && result.value.map((p) => p.offBarcode)).toEqual(['8681324002837']);
  });

  it('falls back to the whole database when the market has nothing', async () => {
    const { off, fetch } = setup(json({ hits: [] }), json({ hits: [AYRAN] }));
    const result = await off.search('ayran', 'tr', 10);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(query(fetch, 1).get('q')).toBe('ayran');
    expect(result.ok && result.value).toHaveLength(1);
  });

  it('searches the whole database for a locale without a market', async () => {
    const { off, fetch } = setup(json({ hits: [AYRAN] }));
    await off.search('ayran', 'de', 10);
    expect(query(fetch).get('q')).toBe('ayran');
  });

  it('escapes query syntax, so a term is searched rather than parsed', async () => {
    const { off, fetch } = setup(json({ hits: [] }));
    await off.search('cola: zero (1l)', 'en', 10);
    expect(query(fetch).get('q')).toBe('cola\\: zero \\(1l\\)');
  });

  it('caches an answer, but not a failure', async () => {
    const { off, fetch } = setup(new Error('socket hang up'), json({ hits: [AYRAN] }));
    expect((await off.search('ayran', 'en', 10)).ok).toBe(false);
    expect((await off.search('ayran', 'en', 10)).ok).toBe(true);
    expect((await off.search('ayran', 'en', 10)).ok).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['an error status', json({}, 503)],
    ['an unreadable answer', json({ results: 'nope' })],
    ['a network error or timeout', new Error('The operation was aborted due to timeout')],
  ])('answers branded_unavailable for %s, without throwing', async (_label, answer) => {
    const { off } = setup(answer);
    const result = await off.search('ayran', 'en', 10);
    expect(!result.ok && result.failure.messageKey).toBe('errors.foods.branded_unavailable');
  });

  it('drops implausible and duplicate hits and keeps at most the limit', async () => {
    const bad = { ...AYRAN, code: '1111111111111', nutriments: { 'energy-kcal_100g': 450, proteins_100g: 0, carbohydrates_100g: 10.6, fat_100g: 0 } };
    const other = { ...AYRAN, code: '2222222222222' };
    const third = { ...AYRAN, code: '3333333333333' };
    const { off } = setup(json({ hits: [AYRAN, bad, AYRAN, other, third, { nonsense: true }] }));
    const result = await off.search('ayran', 'en', 2);
    expect(result.ok && result.value.map((p) => p.offBarcode)).toEqual(['8681324002837', '2222222222222']);
  });
});

describe('OpenFoodFactsSearch.findByBarcode', () => {
  it('reads one product from the product API', async () => {
    const { off, fetch } = setup(json({ code: AYRAN.code, product: AYRAN, status: 1 }));
    const result = await off.findByBarcode('8681324002837', 'tr');
    expect(fetch.mock.calls[0][0]).toMatch(/^https:\/\/world\.openfoodfacts\.org\/api\/v2\/product\/8681324002837\?/);
    expect(result.ok && result.value?.brand).toBe('Sütaş');
  });

  it('answers null, and remembers it, for a barcode the database does not have', async () => {
    const { off, fetch } = setup(json({ status: 0 }, 404));
    expect(await off.findByBarcode('12345678', 'tr')).toEqual({ ok: true, value: null });
    expect(await off.findByBarcode('12345678', 'tr')).toEqual({ ok: true, value: null });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('answers branded_unavailable when the API is down', async () => {
    const { off } = setup(json({}, 502));
    const result = await off.findByBarcode('12345678', 'tr');
    expect(!result.ok && result.failure.messageKey).toBe('errors.foods.branded_unavailable');
  });
});
