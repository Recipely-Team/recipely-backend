import { Entity } from '@core/entity/entity';
import { fail, ok, type Result } from '@core/result/result';
import { ValidationFailure } from '@core/failure';
import { foldText } from '@domain/common/fold-text';
import { DmRuleLimits } from '@domain/instagram/dm-rule-limits';
import type { DmRuleProps } from '@domain/instagram/dm-rule-props';
import { carriesForeignLink } from '@domain/instagram/foreign-link';

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
 * - **No other link**, in the DM or the public reply (`carriesForeignLink`):
 *   Recipely sends these to strangers in its own name.
 */
export class DmRule extends Entity<DmRuleProps> {
  private constructor(props: DmRuleProps) {
    super(props);
  }

  /** A rule from new input: every rule, including "no link but the recipe's own". */
  static create(props: DmRuleProps): Result<DmRule, ValidationFailure> {
    return DmRule.build(props, true);
  }

  /**
   * A stored rule. Skips the link rule, which is newer than some stored rows: such
   * a rule must still load — so its owner can see, disable and fix it — but it is
   * never sent (`isSendable`).
   */
  static restore(props: DmRuleProps): Result<DmRule, ValidationFailure> {
    return DmRule.build(props, false);
  }

  private static build(props: DmRuleProps, checkLinks: boolean): Result<DmRule, ValidationFailure> {
    if (props.mediaId.trim().length === 0) return fail(new ValidationFailure('errors.validation.dm_rule_media_required', 'mediaId'));
    const keywords = DmRule.cleanKeywords(props.keywords);
    if (keywords.length === 0 || keywords.length > DmRuleLimits.KeywordsMax || keywords.some((k) => k.length > DmRuleLimits.KeywordMaxLength)) {
      return fail(new ValidationFailure('errors.validation.dm_rule_keywords_invalid', 'keywords'));
    }
    const dmText = props.dmText.trim();
    if (dmText.length === 0 || dmText.length > DmRuleLimits.DmTextMaxLength) {
      return fail(new ValidationFailure('errors.validation.dm_rule_text_invalid', 'dmText'));
    }
    if (checkLinks && carriesForeignLink(dmText)) return fail(new ValidationFailure('errors.validation.dm_rule_link_not_allowed', 'dmText'));
    const publicReplyText = props.publicReplyText?.trim() || null;
    if (publicReplyText !== null && publicReplyText.length > DmRuleLimits.PublicReplyMaxLength) {
      return fail(new ValidationFailure('errors.validation.dm_rule_reply_invalid', 'publicReplyText'));
    }
    if (checkLinks && publicReplyText !== null && carriesForeignLink(publicReplyText)) {
      return fail(new ValidationFailure('errors.validation.dm_rule_link_not_allowed', 'publicReplyText'));
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

  /**
   * The same rule with its editable fields replaced, validated again.
   * Switching it back on restarts `enabledAt`: the comments of the time it was
   * off are not answered.
   */
  edit(change: Partial<Pick<DmRuleProps, 'keywords' | 'recipeId' | 'dmText' | 'publicReplyText' | 'enabled'>>, now: Date): Result<DmRule, ValidationFailure> {
    const reEnabled = change.enabled === true && !this.props.enabled;
    // Turning a rule off, or changing only its keywords, must work even on a
    // stored rule from before the link rule; new text or switching it on must pass it.
    const checkLinks = change.dmText !== undefined || change.publicReplyText !== undefined || change.enabled === true;
    return DmRule.build({ ...this.props, ...change, ...(reEnabled ? { enabledAt: now } : {}), updatedAt: now }, checkLinks);
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
  /** False for a stored rule whose text carries a foreign link — delivery skips it. */
  get isSendable(): boolean {
    return !carriesForeignLink(this.props.dmText) && !(this.props.publicReplyText !== null && carriesForeignLink(this.props.publicReplyText));
  }
  get publicReplyText(): string | null { return this.props.publicReplyText; }
  get enabled(): boolean { return this.props.enabled; }
  get enabledAt(): Date { return this.props.enabledAt; }
  get createdAt(): Date { return this.props.createdAt; }
  get updatedAt(): Date { return this.props.updatedAt; }
}
