import { Entity } from '@core/entity/entity';
import { fail, ok, type Result } from '@core/result/result';
import { ValidationFailure } from '@core/failure';
import { foldText } from '@domain/common/fold-text';
import { DmRuleLimits } from '@domain/instagram/dm-rule-limits';
import type { DmRuleProps } from '@domain/instagram/dm-rule-props';

const NAME = /\{name\}/g;
const LINK = /\{link\}/g;
const LINK_TOKEN = '{link}';
const WORD_EDGE = /[\p{L}\p{N}]/u;

/**
 * **"When someone comments one of these keywords on this post, DM them this recipe."**
 *
 * @remarks
 * - Keywords are trimmed, de-duplicated (folded) and kept as typed; 1–10 of
 *   1–40 characters. A comment matches when a keyword appears in it as whole
 *   words, folded — "Tarif!" and "TARİF lütfen" both match `tarif`, "tarifler"
 *   does not.
 * - The DM text may say `{name}` (the commenter's username) and `{link}` (the
 *   recipe's page); without `{link}` the link is appended, so the message
 *   always carries the recipe.
 */
export class DmRule extends Entity<DmRuleProps> {
  private constructor(props: DmRuleProps) {
    super(props);
  }

  static create(props: DmRuleProps): Result<DmRule, ValidationFailure> {
    if (props.mediaId.trim().length === 0) return fail(new ValidationFailure('errors.validation.dm_rule_media_required', 'mediaId'));
    const keywords = DmRule.cleanKeywords(props.keywords);
    if (keywords.length === 0 || keywords.length > DmRuleLimits.KeywordsMax || keywords.some((k) => k.length > DmRuleLimits.KeywordMaxLength)) {
      return fail(new ValidationFailure('errors.validation.dm_rule_keywords_invalid', 'keywords'));
    }
    const dmText = props.dmText.trim();
    if (dmText.length === 0 || dmText.length > DmRuleLimits.DmTextMaxLength) {
      return fail(new ValidationFailure('errors.validation.dm_rule_text_invalid', 'dmText'));
    }
    const publicReplyText = props.publicReplyText?.trim() || null;
    if (publicReplyText !== null && publicReplyText.length > DmRuleLimits.PublicReplyMaxLength) {
      return fail(new ValidationFailure('errors.validation.dm_rule_reply_invalid', 'publicReplyText'));
    }
    return ok(new DmRule({ ...props, keywords, dmText, publicReplyText }));
  }

  /** Whether `comment` carries one of the keywords as whole words, case and accents folded. */
  matches(comment: string): boolean {
    const text = foldText(comment);
    return this.props.keywords.some((keyword) => {
      const word = foldText(keyword);
      for (let at = text.indexOf(word); at !== -1; at = text.indexOf(word, at + 1)) {
        const before = text[at - 1];
        const after = text[at + word.length];
        if ((before === undefined || !WORD_EDGE.test(before)) && (after === undefined || !WORD_EDGE.test(after))) return true;
      }
      return false;
    });
  }

  /** The DM for one commenter: placeholders filled, the link appended when the text has no `{link}`. */
  render(commenterName: string, recipeLink: string): string {
    const text = this.props.dmText.includes(LINK_TOKEN) ? this.props.dmText : `${this.props.dmText}\n${LINK_TOKEN}`;
    return text.replace(NAME, commenterName).replace(LINK, recipeLink);
  }

  /** The same rule with its editable fields replaced, validated again. */
  edit(change: Partial<Pick<DmRuleProps, 'keywords' | 'recipeId' | 'dmText' | 'publicReplyText' | 'enabled'>>, now: Date): Result<DmRule, ValidationFailure> {
    return DmRule.create({ ...this.props, ...change, updatedAt: now });
  }

  private static cleanKeywords(raw: readonly string[]): string[] {
    const seen = new Set<string>();
    return raw
      .map((keyword) => keyword.trim())
      .filter((keyword) => {
        const folded = foldText(keyword);
        if (folded.length === 0 || seen.has(folded)) return false;
        seen.add(folded);
        return true;
      });
  }

  get userId(): string { return this.props.userId; }
  get mediaId(): string { return this.props.mediaId; }
  get media(): DmRuleProps['media'] { return this.props.media; }
  get keywords(): readonly string[] { return this.props.keywords; }
  get recipeId(): string { return this.props.recipeId; }
  get dmText(): string { return this.props.dmText; }
  get publicReplyText(): string | null { return this.props.publicReplyText; }
  get enabled(): boolean { return this.props.enabled; }
  get createdAt(): Date { return this.props.createdAt; }
  get updatedAt(): Date { return this.props.updatedAt; }
}
