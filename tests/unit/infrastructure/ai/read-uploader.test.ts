import { readUploader } from '@infrastructure/ai/import/reel-media';

/**
 * TikTok puts a numeric user id in `uploader_id` and the handle in `uploader`,
 * and `channel` is a display name. Taking the first field would have named a
 * TikTok recipe's source "6747935906352907269".
 */
describe('readUploader', () => {
  it('reads an Instagram handle from uploader_id', () => {
    expect(readUploader({ uploader_id: 'birseyler_pisiyor', uploader: 'Bir Şeyler Pişiyor' })).toBe('birseyler_pisiyor');
  });

  it('skips TikTok’s numeric id and its display name for the handle', () => {
    expect(readUploader({ uploader_id: '6747935906352907269', uploader: 'gordonramsayofficial', channel: 'Gordon Ramsay' })).toBe(
      'gordonramsayofficial',
    );
  });

  it('gives nothing rather than a name that is not a handle', () => {
    expect(readUploader({ channel: 'Gordon Ramsay' })).toBeUndefined();
  });
});
