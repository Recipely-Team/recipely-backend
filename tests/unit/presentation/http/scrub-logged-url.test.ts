import { scrubLoggedUrl } from '@presentation/http/scrub-logged-url';

describe('scrubLoggedUrl', () => {
  it.each([
    ['/auth/instagram/callback?code=SECRET&state=JWT', '/auth/instagram/callback?[redacted]'],
    ['/webhooks/instagram?hub.mode=subscribe&hub.verify_token=SECRET&hub.challenge=1', '/webhooks/instagram?[redacted]'],
    ['/webhooks/instagram/data-deletion?x=1', '/webhooks/instagram/data-deletion?[redacted]'],
  ])('logs %p without its query', (url, logged) => {
    expect(scrubLoggedUrl(url)).toBe(logged);
  });

  it.each(['/api/v1/recipes?search=ayran', '/webhooks/instagramX?keep=1', '/auth/instagram/callback'])('leaves %p alone', (url) => {
    expect(scrubLoggedUrl(url)).toBe(url);
  });
});
