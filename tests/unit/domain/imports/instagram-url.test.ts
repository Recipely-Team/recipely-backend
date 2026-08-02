import { InstagramUrl } from '@domain/imports/instagram-url';

/**
 * This value object is the whole of the SSRF guard: the URL it accepts is
 * handed to yt-dlp, which will fetch whatever it is pointed at — including the
 * cloud metadata endpoint that hands out the box's credentials.
 */

describe('InstagramUrl accepts', () => {
  it.each([
    'https://www.instagram.com/reel/Cxyz/',
    'https://instagram.com/p/Cxyz/',
  ])('%s', (raw) => {
    expect(InstagramUrl.create(raw).ok).toBe(true);
  });

  it('trims, so a pasted link with a trailing newline enqueues and re-runs identically', () => {
    const r = InstagramUrl.create('  https://www.instagram.com/reel/Cxyz/\n');
    if (!r.ok) throw new Error('rejected a valid url');

    expect(r.value.toString()).toBe('https://www.instagram.com/reel/Cxyz/');
  });
});

describe('InstagramUrl rejects', () => {
  it.each([
    ['the metadata endpoint that hands out the box credentials', 'http://169.254.169.254/latest/meta-data/'],
    ['anything on the box itself', 'http://127.0.0.1:3000/admin'],
    ['a host that merely contains the word', 'https://instagram.com.evil.test/reel/x'],
    ['a lookalike subdomain', 'https://evil.instagram.com.attacker.test/x'],
    ['a file URL', 'file:///etc/passwd'],
    ['a non-URL', 'not a url'],
    ['nothing at all', '   '],
  ])('%s', (_why, raw) => {
    expect(InstagramUrl.create(raw).ok).toBe(false);
  });
});
