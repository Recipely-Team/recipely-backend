/**
 * The photo licences a curated recipe may carry. Stored in
 * `recipes.image_credit_license`.
 *
 * @remarks
 * - **A closed list, on purpose.** Every value here allows commercial use and
 *   derivatives (a crop is a derivative). NC and ND licences are absent, so
 *   they are refused by construction rather than by a check someone has to
 *   remember; an unknown licence is refused the same way.
 * - **CC BY and CC BY-SA require attribution**, which the app renders from
 *   `ImageCredit`; CC0 and public domain do not, but the credit is shown anyway.
 */
export const ImageLicense = {
  Cc0: 'CC0',
  PublicDomain: 'PD',
  CcBy20: 'CC-BY-2.0',
  CcBy30: 'CC-BY-3.0',
  CcBy40: 'CC-BY-4.0',
  CcBySa20: 'CC-BY-SA-2.0',
  CcBySa30: 'CC-BY-SA-3.0',
  CcBySa40: 'CC-BY-SA-4.0',
} as const;

export type ImageLicenseType = (typeof ImageLicense)[keyof typeof ImageLicense];

export const isImageLicense = (v: unknown): v is ImageLicenseType =>
  (Object.values(ImageLicense) as unknown[]).includes(v);
