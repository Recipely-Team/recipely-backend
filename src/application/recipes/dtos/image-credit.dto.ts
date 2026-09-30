/**
 * The cover photo's credit line, as the app renders it under the photo:
 * "Photo: {author} · {license}", linking to `url`.
 */
export interface ImageCreditDto {
  readonly author: string;
  /** One of `ImageLicense`: `CC0`, `PD`, `CC-BY-x.y`, `CC-BY-SA-x.y`. */
  readonly license: string;
  /** The page the photo was found on (https). */
  readonly url: string;
}
