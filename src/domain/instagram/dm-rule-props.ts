/** What a comment-to-DM rule is built from (see `DmRule`). */
export interface DmRuleProps {
  readonly id: string;
  readonly userId: string;
  readonly mediaId: string;
  /** A snapshot of the post, for the rules list; any part may be unknown. */
  readonly media: {
    readonly permalink: string | null;
    readonly thumbnailUrl: string | null;
    readonly caption: string | null;
  };
  readonly keywords: readonly string[];
  readonly recipeId: string;
  readonly dmText: string;
  readonly publicReplyText: string | null;
  readonly enabled: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}
