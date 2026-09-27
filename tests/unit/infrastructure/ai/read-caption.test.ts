import { readCaption } from '@infrastructure/ai/import/read-caption';

/**
 * A Facebook reel shared by a user (`facebook.com/share/r/192Dg7W54U`) failed
 * every import with "no recipe found". yt-dlp reports its caption as `title`
 * ("Buruşuk sütlaç tarifi") and leaves `description` empty; the probe read only
 * `description`, so the model saw three frames of a pot and no words at all.
 */
describe('readCaption', () => {
  it('reads a Facebook reel caption that yt-dlp reports as its title', () => {
    expect(readCaption({ extractor: 'facebook', title: 'Buruşuk sütlaç tarifi', description: '', uploader: 'Farklıyemektarifleri' })).toBe(
      'Buruşuk sütlaç tarifi',
    );
  });

  it('prefers the description whenever there is one', () => {
    expect(readCaption({ extractor: 'facebook', title: 'Sütlaç', description: 'Malzemeler: 1 lt süt' })).toBe('Malzemeler: 1 lt süt');
  });

  it('ignores Instagram’s placeholder title', () => {
    expect(readCaption({ extractor: 'Instagram', title: 'Video by guneycooks', description: '' })).toBe('');
  });

  it('does not take a Facebook page name for a caption', () => {
    expect(readCaption({ extractor: 'facebook', title: 'Farklıyemektarifleri', uploader: 'Farklıyemektarifleri' })).toBe('');
  });

  it('gives an empty caption when yt-dlp reports none', () => {
    expect(readCaption({ extractor: 'facebook' })).toBe('');
  });
});
