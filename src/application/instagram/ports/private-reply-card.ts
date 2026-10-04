/**
 * The recipe card a private reply carries: Instagram renders it the same on
 * iOS and Android (photo, title, short text, an "open" button), while a bare
 * link in a message request is neither previewed nor tappable on iOS.
 */
export interface PrivateReplyCard {
  readonly title: string;
  readonly subtitle: string;
  readonly imageUrl: string | null;
  readonly url: string;
  readonly buttonTitle: string;
}
