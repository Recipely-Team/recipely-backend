import { ImageCredit } from '@domain/recipes/curated/image-credit';
import { ImageLicense } from '@domain/recipes/curated/image-license';

const URL_OK = 'https://commons.wikimedia.org/wiki/File:Mercimek.jpg';
const make = (over: Partial<{ author: string; license: string; url: string }> = {}) =>
  ImageCredit.create({ author: 'Jane Doe', license: ImageLicense.CcBy40, url: URL_OK, ...over });

describe('ImageCredit', () => {
  it.each(['CC0', 'PD', 'CC-BY-2.0', 'CC-BY-3.0', 'CC-BY-4.0', 'CC-BY-SA-2.0', 'CC-BY-SA-3.0', 'CC-BY-SA-4.0'])(
    'accepts the reusable licence %s',
    (license) => {
      const credit = make({ license });
      expect(credit.ok && credit.value.license).toBe(license);
    },
  );

  it('accepts exactly the ImageLicense vocabulary', () => {
    expect(Object.values(ImageLicense)).toHaveLength(8);
    for (const license of Object.values(ImageLicense)) expect(make({ license }).ok).toBe(true);
  });

  // NC forbids the commercial use an app with ads is; ND forbids the crop every card makes.
  it.each([
    'CC-BY-NC-4.0', 'CC-BY-NC-SA-4.0', 'CC-BY-ND-4.0', 'CC-BY-NC-ND-4.0', 'CC-BY-NC-2.0', 'CC-BY-ND-3.0',
    'CC-BY-1.0', 'CC-BY-SA-2.5', 'GFDL', 'All rights reserved', 'unknown', '', 'cc-by-4.0',
  ])('refuses the licence %p', (license) => {
    const credit = make({ license });
    expect(credit.ok).toBe(false);
    if (!credit.ok) {
      expect(credit.failure.messageKey).toBe('errors.validation.image_credit_invalid');
      expect(credit.failure.field).toBe('imageCredit.license');
    }
  });

  it.each(['', '   '])('refuses an empty author %p', (author) => {
    const credit = make({ author });
    expect(!credit.ok && credit.failure.field).toBe('imageCredit.author');
  });

  it.each(['http://commons.wikimedia.org/wiki/File:X.jpg', 'ftp://example.org/x', 'commons.wikimedia.org/x', 'not a url', ''])(
    'refuses a source that is not an https URL: %p',
    (url) => {
      const credit = make({ url });
      expect(!credit.ok && credit.failure.field).toBe('imageCredit.url');
    },
  );

  it('trims its parts and hands them back as a snapshot', () => {
    const credit = make({ author: '  Jane Doe ', url: ` ${URL_OK} ` });
    expect(credit.ok && credit.value.toSnapshot()).toEqual({ author: 'Jane Doe', license: 'CC-BY-4.0', url: URL_OK });
  });
});
