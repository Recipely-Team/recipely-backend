/** A follower, and the language to write to them in (`null`: not known yet). */
export interface FollowerLocale {
  readonly userId: string;
  readonly locale: string | null;
}
