import { FallbackImageModerator } from '@infrastructure/ai/fallback-image-moderator';
import type { IImageModerator } from '@application/ai/ports/i-image-moderator';

/**
 * The chain exists so that one provider's spent quota is a slower answer rather
 * than an unchecked photo. Two rules follow from that, and they pull in
 * opposite directions — which is why both are pinned here.
 */

const REQUEST = { image: Buffer.from('jpeg'), mimeType: 'image/jpeg' };

const answering = (verdict: 'approved' | 'rejected', seen: string[], name: string): IImageModerator => ({
  moderate: async () => {
    seen.push(name);
    return verdict === 'approved'
      ? { ok: true, value: { status: 'approved' } }
      : { ok: true, value: { status: 'rejected', reason: 'nope' } };
  },
});

const failing = (seen: string[], name: string): IImageModerator => ({
  moderate: async () => {
    seen.push(name);
    return { ok: false, failure: { code: 'service_unavailable' } as never };
  },
});

describe('the image moderation chain', () => {
  it('moves on when a provider cannot answer', async () => {
    const seen: string[] = [];
    const chain = new FallbackImageModerator([failing(seen, 'first'), answering('approved', seen, 'second')]);

    const result = await chain.moderate(REQUEST);

    expect(result.ok).toBe(true);
    expect(seen).toEqual(['first', 'second']);
  });

  // A rejection is an ANSWER. Asking the next provider to look again would be
  // shopping for the verdict we wanted.
  it('never asks a second provider to overturn a rejection', async () => {
    const seen: string[] = [];
    const chain = new FallbackImageModerator([answering('rejected', seen, 'first'), answering('approved', seen, 'second')]);

    const result = await chain.moderate(REQUEST);

    expect(result.ok && result.value.status).toBe('rejected');
    expect(seen).toEqual(['first']);
  });

  /**
   * The whole point. Everyone failing is a failure, and the caller turns that
   * into a refusal — silence about a picture must never read as approval.
   */
  it('fails when nobody could answer, rather than approving', async () => {
    const seen: string[] = [];
    const chain = new FallbackImageModerator([failing(seen, 'first'), failing(seen, 'second')]);

    const result = await chain.moderate(REQUEST);

    expect(result.ok).toBe(false);
    expect(seen).toEqual(['first', 'second']);
  });
});
