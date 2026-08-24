import { toLiveLanguageCode } from '@infrastructure/assistant/live-language';

/**
 * The app selects languages by two-letter code; the Live API's
 * `speechConfig.languageCode` is BCP-47 with a region. Given a code it does not
 * recognise it does not fail — it stops pinning the language and infers one
 * from the audio. A Turkish user was answered in Hindi, and every instruction
 * they gave was then transcribed as whatever that guess made of it.
 */
describe('toLiveLanguageCode', () => {
  it('widens the codes the app picker actually offers', () => {
    expect(toLiveLanguageCode('tr')).toBe('tr-TR');
    expect(toLiveLanguageCode('en')).toBe('en-US');
    expect(toLiveLanguageCode('pt')).toBe('pt-BR');
  });

  it('passes a tagged locale through, so a client that sends one needs no change', () => {
    expect(toLiveLanguageCode('tr-TR')).toBe('tr-TR');
  });

  it('never returns an untagged code, whatever it is given', () => {
    expect(toLiveLanguageCode('xx')).toContain('-');
  });
});
