/** A comment-to-DM rule as its owner sees it. */
export interface DmRuleDto {
  readonly id: string;
  readonly mediaId: string;
  readonly media: {
    readonly permalink: string | null;
    readonly thumbnailUrl: string | null;
    readonly caption: string | null;
  };
  readonly keywords: readonly string[];
  readonly recipeId: string;
  /** The recipe in the request locale; `null` once it is deleted. */
  readonly recipe: { readonly id: string; readonly name: string; readonly image: string } | null;
  /** May contain `{name}` and `{link}`. */
  readonly dmText: string;
  readonly publicReplyText: string | null;
  readonly enabled: boolean;
  /** Private replies it has sent. */
  readonly sentCount: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}
