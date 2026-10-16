import type { CalendarDate } from '@domain/diary/calendar-date';
import type { MealSlotType } from '@domain/diary/meal-slot';
import type { PlanCandidate } from '@domain/meal-plan/week-draft/plan-candidate';
import type { DraftedSlot } from '@domain/meal-plan/week-draft/drafted-slot';
import { slotFit } from '@domain/meal-plan/week-draft/slot-fit';

export interface DraftWeekInput {
  readonly candidates: readonly PlanCandidate[];
  /** Recipes planned in the weeks before: used only once everything fresh is spent. */
  readonly recentIds: ReadonlySet<string>;
  readonly slots: readonly { readonly date: CalendarDate; readonly meal: MealSlotType }[];
  /** The same seed drafts the same week; a new one is "shuffle again". */
  readonly seed: number;
}

/** mulberry32: small, seedable, and good enough to order a few dozen recipes. */
const random = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/**
 * A week of meals from the user's own recipes, with one swap per meal.
 *
 * @remarks
 * - **No recipe twice in a week**, picks and swaps together, so taking every
 *   swap still gives a week without repeats.
 * - **Fresh before recent.** A recipe planned in the weeks before is used only
 *   when nothing else fits — the planner complaint is "the same five recipes".
 * - **Variety by category.** The same kind of dish two days running (soup,
 *   soup) is passed over while anything else fits.
 * - **Pure and seeded**, so a test can name the week it expects and the app's
 *   "shuffle" is a new seed, not a new rule.
 */
export const draftWeek = (input: DraftWeekInput): DraftedSlot[] => {
  const next = random(input.seed);
  const order = new Map(input.candidates.map((c) => [c.id, next()]));
  const used = new Set<string>();
  const lastCategory = new Map<MealSlotType, string>();

  const rank = (meal: MealSlotType) => (c: PlanCandidate): number => {
    const fit = slotFit(meal, c.category);
    if (fit === 0 || used.has(c.id)) return -1;
    const fresh = input.recentIds.has(c.id) ? 0 : 4;
    const varied = lastCategory.get(meal) === c.category ? 0 : 2;
    return fresh + varied + fit + (order.get(c.id) ?? 0);
  };

  return input.slots.map(({ date, meal }) => {
    const score = rank(meal);
    const ranked = input.candidates
      .map((c) => ({ c, s: score(c) }))
      .filter((r) => r.s >= 0)
      .sort((a, b) => b.s - a.s);
    const pick = ranked[0]?.c ?? null;
    const alternative = ranked[1]?.c ?? null;
    if (pick !== null) {
      used.add(pick.id);
      lastCategory.set(meal, pick.category);
    }
    if (alternative !== null) used.add(alternative.id);
    return { date, meal, pickId: pick?.id ?? null, alternativeId: alternative?.id ?? null };
  });
};
