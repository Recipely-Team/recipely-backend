import { CreatorHandle } from '@domain/users/creator-handle';
import { CreatorPlatform } from '@domain/users/creator-platform';

const { Instagram, TikTok } = CreatorPlatform;

function valueOf(platform: CreatorPlatform, raw: string): string | null {
  const result = CreatorHandle.create(platform, raw);
  return result.ok ? result.value.value : null;
}

function rejects(platform: CreatorPlatform, raw: string): void {
  const result = CreatorHandle.create(platform, raw);
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.failure.messageKey).toBe('errors.validation.creator_handle');
    expect(result.failure.field).toBe('handle');
  }
}

describe('CreatorHandle — normalisation', () => {
  it('strips one leading @ and lowercases', () => {
    expect(valueOf(Instagram, '@Ada.Cooks')).toBe('ada.cooks');
  });

  it('drops surrounding whitespace', () => {
    expect(valueOf(TikTok, '  @ada_cooks ')).toBe('ada_cooks');
  });

  it('strips only one @ — a second is an invalid character', () => {
    rejects(Instagram, '@@ada');
  });

  it('keeps the platform it was validated for', () => {
    const result = CreatorHandle.create(TikTok, 'ada');
    expect(result.ok && result.value.platform).toBe(TikTok);
  });
});

describe('CreatorHandle — characters', () => {
  it.each(['ada', 'ada.cooks', 'ada_cooks', 'a1_b2.c3', '_ada_', '123'])('accepts %s', (raw) => {
    expect(valueOf(Instagram, raw)).toBe(raw);
  });

  it.each(['ada cooks', 'ada-cooks', 'adá', 'ada!', 'ada@cooks', 'ada/cooks', '@'])('rejects %s', (raw) => {
    rejects(Instagram, raw);
    rejects(TikTok, raw);
  });

  it('rejects an empty handle', () => {
    rejects(Instagram, '');
    rejects(TikTok, '   ');
  });
});

describe('CreatorHandle — dots', () => {
  it.each(['.ada', 'ada.', 'ada..cooks', '.', '..'])('rejects %s', (raw) => {
    rejects(Instagram, raw);
    rejects(TikTok, raw);
  });

  it('accepts dots that are single and inside', () => {
    expect(valueOf(TikTok, 'a.d.a')).toBe('a.d.a');
  });
});

describe('CreatorHandle — length limits per platform', () => {
  it('Instagram: 1 to 30 characters', () => {
    expect(valueOf(Instagram, 'a')).toBe('a');
    expect(valueOf(Instagram, 'a'.repeat(30))).toBe('a'.repeat(30));
    rejects(Instagram, 'a'.repeat(31));
  });

  it('TikTok: 2 to 24 characters', () => {
    rejects(TikTok, 'a');
    expect(valueOf(TikTok, 'ab')).toBe('ab');
    expect(valueOf(TikTok, 'a'.repeat(24))).toBe('a'.repeat(24));
    rejects(TikTok, 'a'.repeat(25));
  });

  it('counts the length after the @ is stripped', () => {
    expect(valueOf(Instagram, '@' + 'a'.repeat(30))).toBe('a'.repeat(30));
    rejects(TikTok, '@a');
  });
});

describe('CreatorHandle — equality', () => {
  it('is equal on platform and normalised handle', () => {
    const a = CreatorHandle.create(Instagram, '@Ada');
    const b = CreatorHandle.create(Instagram, 'ada');
    const c = CreatorHandle.create(TikTok, 'ada');
    if (!a.ok || !b.ok || !c.ok) throw new Error('unreachable');
    expect(a.value.equals(b.value)).toBe(true);
    expect(a.value.equals(c.value)).toBe(false);
  });
});
