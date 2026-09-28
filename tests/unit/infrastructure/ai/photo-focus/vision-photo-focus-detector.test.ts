import { fail, ok } from '@core/result/result';
import { ServiceUnavailableFailure, ValidationFailure } from '@core/failure';
import { VisionPhotoFocusDetector } from '@infrastructure/ai/photo-focus/vision-photo-focus-detector';
import type { PhotoImageLoader } from '@infrastructure/ai/photo-focus/photo-image-loader';
import type { FocusVisionClientInterface } from '@infrastructure/ai/photo-focus/focus-vision-client-interface';
import { pinoInstance } from '@infrastructure/logger/pino-logger';

jest.mock('@infrastructure/logger/pino-logger', () => ({ pinoInstance: { warn: jest.fn() } }));

const photo = { bytes: Buffer.from('jpeg'), mimeType: 'image/jpeg' };
const loaderReturning = (result: Awaited<ReturnType<PhotoImageLoader['load']>>) =>
  ({ load: jest.fn().mockResolvedValue(result) }) as unknown as PhotoImageLoader;
const client = (provider: string, reply: Awaited<ReturnType<FocusVisionClientInterface['ask']>>) => ({
  provider,
  ask: jest.fn().mockResolvedValue(reply),
});

describe('VisionPhotoFocusDetector', () => {
  it('asks Gemini first and stops at its answer', async () => {
    const gemini = client('gemini', ok('{"x":0.3,"y":0.7}'));
    const groq = client('groq', ok('{"x":0.9,"y":0.9}'));
    const r = await new VisionPhotoFocusDetector(loaderReturning(ok(photo)), [gemini, groq]).detect('u');
    expect(r.ok && [r.value.x, r.value.y]).toEqual([0.3, 0.7]);
    expect(groq.ask).not.toHaveBeenCalled();
  });

  it('falls through to the next provider on an outage or an unreadable reply', async () => {
    const down = client('gemini', fail(new ServiceUnavailableFailure('errors.ai.upstream_failed')));
    const chatty = client('other', ok('The dish is in the middle.'));
    const groq = client('groq', ok('{"x":0.4,"y":0.5}'));
    const r = await new VisionPhotoFocusDetector(loaderReturning(ok(photo)), [down, chatty, groq]).detect('u');
    expect(r.ok && [r.value.x, r.value.y]).toEqual([0.4, 0.5]);
  });

  it('fails when every provider fails', async () => {
    const r = await new VisionPhotoFocusDetector(loaderReturning(ok(photo)), [
      client('gemini', ok('nope')),
    ]).detect('u');
    expect(r.ok).toBe(false);
  });

  it('spends no model call on a photo it could not load', async () => {
    const gemini = client('gemini', ok('{"x":0.3,"y":0.7}'));
    const r = await new VisionPhotoFocusDetector(
      loaderReturning(fail(new ValidationFailure('errors.validation.image_invalid', 'image'))),
      [gemini],
    ).detect('u');
    expect(r.ok).toBe(false);
    expect(gemini.ask).not.toHaveBeenCalled();
  });

  // Review finding: an unparseable reply left only a message key behind, so
  // nobody could tell what the model had actually said.
  it('logs an unreadable reply, cut to 500 characters, with the image url', async () => {
    const warn = pinoInstance.warn as jest.Mock;
    warn.mockClear();
    const essay = 'x'.repeat(800);

    await new VisionPhotoFocusDetector(loaderReturning(ok(photo)), [client('gemini', ok(essay))]).detect(
      'https://cdn.example.com/p.jpg',
    );

    const logged = warn.mock.calls.find(([, message]) => message === 'photo_focus_reply_unreadable');
    expect(logged?.[0]).toEqual({ provider: 'gemini', imageUrl: 'https://cdn.example.com/p.jpg', reply: 'x'.repeat(500) });
  });
});
