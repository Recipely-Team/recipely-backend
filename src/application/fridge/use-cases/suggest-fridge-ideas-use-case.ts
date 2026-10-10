import { fail, ok, type Result } from '@core/result/result';
import { ServiceUnavailableFailure, TooManyRequestsFailure, ValidationFailure, type Failure } from '@core/failure';
import { foldText } from '@domain/common/fold-text';
import { ModerationStatus } from '@domain/moderation/moderation-status';
import type { FridgeDietType } from '@domain/fridge/fridge-diet';
import type { FridgeUsageRepositoryInterface } from '@domain/fridge/fridge-usage-repository-interface';
import type { ContentModeratorInterface } from '@application/moderation/ports/content-moderator-interface';
import { contentBlockedFailure } from '@application/moderation/content-blocked-failure';
import { startOfUtcDay } from '@application/assistant/start-of-utc-day';
import type { FridgeIdeaGeneratorInterface, SuggestedIdea } from '@application/fridge/ports/fridge-idea-generator-interface';
import { FridgeLimits } from '@application/fridge/fridge-limits';
import { isPantryStaple } from '@application/fridge/pantry-staples';
import type { FridgeIdeasDto } from '@application/fridge/dtos/fridge-ideas.dto';
import type { FridgeIdeaDto } from '@application/fridge/dtos/fridge-idea.dto';

export interface SuggestFridgeIdeasInput {
  readonly userId: string;
  readonly ingredients: readonly string[];
  readonly maxMinutes: number | null;
  readonly diet: FridgeDietType;
  readonly servings: number | null;
  readonly exclude: readonly string[];
  readonly locale: string;
}

const WHITESPACE_RUN = /\s+/g;
const squish = (text: string): string => text.replace(WHITESPACE_RUN, ' ').trim();

/**
 * Three dish ideas from what the user has.
 *
 * @remarks
 * - **The user's words are moderated before they cost anything**: a flagged
 *   ingredient refuses the request (`errors.validation.content_blocked`); a
 *   flagged excluded title is just left out of the prompt.
 * - **One allowance with the scan**, refunded when the provider chain fails
 *   or when cleaning leaves nothing to show.
 * - **Model text is held to the request**: `uses` keeps only ingredients the
 *   request sent (in its spelling), `missing` drops pantry staples and
 *   anything already in hand and keeps 5, an idea over `maxMinutes` or
 *   repeating an excluded title is dropped, and an idea whose title or
 *   summary fails the word list is dropped. Three ideas answer; fewer only
 *   when that cleaning removed some, and none is `errors.fridge.unavailable`.
 */
export class SuggestFridgeIdeasUseCase {
  constructor(
    private readonly generator: FridgeIdeaGeneratorInterface,
    private readonly usage: FridgeUsageRepositoryInterface,
    private readonly contentModerator: ContentModeratorInterface,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(input: SuggestFridgeIdeasInput): Promise<Result<FridgeIdeasDto, Failure>> {
    const ingredients = dedupe(input.ingredients.map(squish).filter((name) => name.length > 0));
    if (ingredients.length === 0) return fail(new ValidationFailure('errors.fridge.ingredients_required', 'ingredients'));
    for (const name of ingredients) {
      const verdict = this.contentModerator.moderate({ text: name, context: 'general' });
      if (verdict.status === ModerationStatus.Rejected) return fail(contentBlockedFailure(verdict.hit));
    }
    const exclude = dedupe(input.exclude.map(squish)).filter((title) => title.length > 0 && this.approved(title));

    const day = startOfUtcDay(this.now());
    const used = await this.usage.consume(input.userId, day);
    if (!used.ok) return used;
    if (used.value > FridgeLimits.dailyPerUser) return fail(new TooManyRequestsFailure('errors.fridge.quota_exceeded'));

    const suggested = await this.generator.suggest({
      ingredients,
      exclude,
      maxMinutes: input.maxMinutes,
      diet: input.diet,
      servings: input.servings,
      locale: input.locale,
    });
    if (!suggested.ok) {
      await this.usage.refund(input.userId, day);
      return suggested;
    }

    const ideas = this.clean(suggested.value, ingredients, exclude, input.maxMinutes);
    if (ideas.length === 0) {
      await this.usage.refund(input.userId, day);
      return fail(new ServiceUnavailableFailure('errors.fridge.unavailable'));
    }
    return ok({ ideas });
  }

  private clean(
    suggested: readonly SuggestedIdea[],
    ingredients: readonly string[],
    exclude: readonly string[],
    maxMinutes: number | null,
  ): FridgeIdeaDto[] {
    const have = new Map(ingredients.map((name) => [foldText(name), name] as const));
    const excluded = new Set(exclude.map(foldText));
    const seenTitles = new Set<string>();
    const ideas: FridgeIdeaDto[] = [];
    for (const idea of suggested) {
      const title = squish(idea.title).slice(0, FridgeLimits.titleMaxChars);
      const summary = squish(idea.summary).slice(0, FridgeLimits.summaryMaxChars);
      const titleKey = foldText(title);
      if (title.length === 0 || excluded.has(titleKey) || seenTitles.has(titleKey)) continue;
      if (maxMinutes !== null && idea.totalMinutes > maxMinutes) continue;
      if (!this.approved(title) || !this.approved(summary)) continue;
      const uses = dedupe(
        idea.uses.map((name) => have.get(foldText(squish(name)))).filter((name): name is string => name !== undefined),
      );
      const missing = dedupe(idea.missing.map(squish))
        .filter((name) => name.length > 0 && !have.has(foldText(name)) && !isPantryStaple(name) && this.approved(name))
        .map((name) => name.slice(0, FridgeLimits.ingredientMaxChars))
        .slice(0, FridgeLimits.maxMissing);
      seenTitles.add(titleKey);
      ideas.push({ title, summary, totalMinutes: idea.totalMinutes, difficulty: idea.difficulty, uses, missing });
      if (ideas.length === FridgeLimits.ideasPerRequest) break;
    }
    return ideas;
  }

  private approved(text: string): boolean {
    return this.contentModerator.moderate({ text }).status === ModerationStatus.Approved;
  }
}

/** First spelling wins; compared folded, so "Domates" and "domates" are one. */
function dedupe(names: readonly string[]): string[] {
  const seen = new Set<string>();
  return names.filter((name) => {
    const key = foldText(name);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
