import { ImportUrl } from '@domain/imports/import-url';
import { SourcePlatform } from '@domain/recipes/source-platform';

/**
 * Two guards meet here. A video link is handed to yt-dlp, which fetches
 * whatever it is pointed at — including the cloud metadata endpoint that hands
 * out the box's credentials — so only an allowlisted host may be classed as
 * one. Anything else is a web page, which the address-checking fetcher reads;
 * this refuses up front what the text alone gives away.
 */

describe('ImportUrl classes as video', () => {
  it.each([
    'https://www.instagram.com/reel/Cxyz/',
    'https://instagram.com/p/Cxyz/',
  ])('%s', (raw) => {
    const r = ImportUrl.create(raw);
    if (!r.ok) throw new Error('rejected a valid url');
    expect(r.value.platform).toBe(SourcePlatform.Instagram);
    expect(r.value.isVideo).toBe(true);
  });

  it.each([
    'https://www.tiktok.com/@gordonramsayofficial/video/7686605253185162518',
    'https://vm.tiktok.com/ZMabc123/',
  ])('%s is a TikTok video', (raw) => {
    const r = ImportUrl.create(raw);
    if (!r.ok) throw new Error('rejected a valid url');
    expect(r.value.platform).toBe(SourcePlatform.TikTok);
    expect(r.value.isVideo).toBe(true);
  });

  it.each(['https://www.facebook.com/share/r/192Dg7W54U/', 'https://fb.watch/abc123/', 'https://m.facebook.com/reel/123'])(
    '%s is a Facebook video',
    (raw) => {
      const r = ImportUrl.create(raw);
      if (!r.ok) throw new Error('rejected a valid url');
      expect(r.value.platform).toBe(SourcePlatform.Facebook);
    },
  );

  it.each([
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtube.com/shorts/dQw4w9WgXcQ',
    'https://m.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtu.be/dQw4w9WgXcQ',
  ])('%s is a YouTube video', (raw) => {
    const r = ImportUrl.create(raw);
    if (!r.ok) throw new Error('rejected a valid url');
    expect(r.value.platform).toBe(SourcePlatform.YouTube);
    expect(r.value.isVideo).toBe(true);
  });

  it('a look-alike host is a web page, not YouTube', () => {
    const r = ImportUrl.create('https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ');
    if (!r.ok) throw new Error('rejected a public url');
    expect(r.value.platform).toBe(SourcePlatform.Web);
  });

  it('trims, so a pasted link with a trailing newline enqueues and re-runs identically', () => {
    const r = ImportUrl.create('  https://www.instagram.com/reel/Cxyz/\n');
    if (!r.ok) throw new Error('rejected a valid url');
    expect(r.value.toString()).toBe('https://www.instagram.com/reel/Cxyz/');
  });
});

describe('ImportUrl classes as a web page, never as video', () => {
  it.each([
    ['a recipe blog', 'https://www.nefisyemektarifleri.com/firinda-tavuk/'],
    ['plain http', 'http://example.com/recipe'],
    ['a host that merely contains the word instagram', 'https://instagram.com.evil.test/reel/x'],
    ['a lookalike subdomain', 'https://evil.instagram.com.attacker.test/x'],
  ])('%s', (_why, raw) => {
    const r = ImportUrl.create(raw);
    if (!r.ok) throw new Error('rejected a public web page');
    expect(r.value.platform).toBe(SourcePlatform.Web);
    expect(r.value.isVideo).toBe(false);
  });

  it('keeps the host, lowercased, for the recipe to name its source by', () => {
    const r = ImportUrl.create('https://WWW.Example.COM/a');
    if (!r.ok) throw new Error('rejected a valid url');
    expect(r.value.host).toBe('www.example.com');
  });
});

describe('ImportUrl rejects', () => {
  it.each([
    ['the metadata endpoint that hands out the box credentials', 'http://169.254.169.254/latest/meta-data/'],
    ['anything on the box itself', 'http://127.0.0.1:3000/admin'],
    ['an IPv6 literal', 'http://[::1]/'],
    ['localhost by name', 'http://localhost/recipe'],
    ['a local-network name', 'http://router.local/'],
    ['a non-web port', 'https://example.com:8443/recipe'],
    ['credentials in the URL', 'https://user:pass@example.com/'],
    ['a file URL', 'file:///etc/passwd'],
    ['another scheme', 'ftp://example.com/recipe.txt'],
    ['a single-label host', 'http://intranet/'],
    ['a non-URL', 'not a url'],
    ['nothing at all', '   '],
  ])('%s', (_why, raw) => {
    expect(ImportUrl.create(raw).ok).toBe(false);
  });
});
