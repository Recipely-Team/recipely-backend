jest.mock('@infrastructure/logger/pino-logger', () => ({
  pinoInstance: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('node:child_process', () => ({ execFile: jest.fn() }));
const mockExecFile = jest.fn();
jest.mock('node:util', () => ({ promisify: jest.fn(() => mockExecFile) }));

import { ReelMedia } from '@infrastructure/ai/import/reel-media';

/**
 * The Facebook reel a user shared failed every import with "no recipe found":
 * its caption ("Buruşuk sütlaç tarifi") is in yt-dlp's `title`, and the probe
 * only read `description`, which Facebook leaves empty.
 */
describe('ReelMedia.probe', () => {
  it('hands a Facebook reel caption that yt-dlp reports as its title to the model', async () => {
    mockExecFile.mockResolvedValueOnce({
      stdout: JSON.stringify({
        extractor: 'facebook',
        title: 'Buruşuk sütlaç tarifi',
        description: '',
        duration: 20.8,
        uploader: 'Farklıyemektarifleri',
      }),
    });

    const probed = await new ReelMedia().probe('https://www.facebook.com/share/r/192Dg7W54U/');

    expect(probed.ok).toBe(true);
    if (probed.ok) expect(probed.value.description).toBe('Buruşuk sütlaç tarifi');
  });
});
