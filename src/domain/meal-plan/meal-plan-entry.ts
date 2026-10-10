import { Entity } from '@core/entity/entity';
import { fail, ok, type Result } from '@core/result/result';
import { ValidationFailure } from '@core/failure';
import type { CalendarDate } from '@domain/diary/calendar-date';
import type { MealSlotType } from '@domain/diary/meal-slot';
import { FoodLogEntry } from '@domain/diary/food-log-entry';
import { MealPlanLimits } from '@domain/meal-plan/meal-plan-limits';

export interface MealPlanEntryProps {
  id: string;
  userId: string;
  date: CalendarDate;
  meal: MealSlotType;
  recipeId: string;
  servings: number;
  /** Order inside its (date, meal) slot, lowest first. */
  position: number;
  /** The diary entry made when it was eaten; `null` while only planned. */
  foodLogEntryId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MealPlanEntryChange {
  readonly date?: CalendarDate;
  readonly meal?: MealSlotType;
  readonly servings?: number;
  readonly position?: number;
}

/**
 * One recipe planned for a day and a meal.
 *
 * @remarks
 * - **Servings follow the diary's scale** (½ steps, ½ to 20), so marking the
 *   plan eaten can always log exactly what was planned.
 * - **Eaten is a link, not a flag**: `foodLogEntryId` names the diary entry,
 *   and the database clears it when that entry is deleted.
 * - **A copy is a new plan**: new id, never eaten.
 */
export class MealPlanEntry extends Entity<MealPlanEntryProps> {
  private constructor(props: MealPlanEntryProps) {
    super(props);
  }

  static create(props: MealPlanEntryProps): Result<MealPlanEntry, ValidationFailure> {
    if (!FoodLogEntry.isValidServings(props.servings)) {
      return fail(new ValidationFailure('errors.validation.servings_invalid', 'servings'));
    }
    if (!MealPlanEntry.isValidPosition(props.position)) {
      return fail(new ValidationFailure('errors.validation.meal_plan_entry_invalid', 'position'));
    }
    return ok(new MealPlanEntry(props));
  }

  static isValidPosition(position: number): boolean {
    return Number.isInteger(position) && position >= 0 && position <= MealPlanLimits.PositionMax;
  }

  /** A copy with the change applied. */
  apply(change: MealPlanEntryChange, now: Date): Result<MealPlanEntry, ValidationFailure> {
    return MealPlanEntry.create({
      ...this.props,
      date: change.date ?? this.props.date,
      meal: change.meal ?? this.props.meal,
      servings: change.servings ?? this.props.servings,
      position: change.position ?? this.props.position,
      updatedAt: now,
    });
  }

  /** The same plan on another day, as a fresh, uneaten row. */
  copyTo(id: string, date: CalendarDate, position: number, now: Date): Result<MealPlanEntry, ValidationFailure> {
    return MealPlanEntry.create({
      ...this.props,
      id,
      date,
      position,
      foodLogEntryId: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  /** Whether a change moves it to another (date, meal) slot. */
  movesSlot(change: MealPlanEntryChange): boolean {
    const dateMoves = change.date !== undefined && change.date.toString() !== this.props.date.toString();
    return dateMoves || (change.meal !== undefined && change.meal !== this.props.meal);
  }

  get eaten(): boolean { return this.props.foodLogEntryId !== null; }
  get userId(): string { return this.props.userId; }
  get date(): CalendarDate { return this.props.date; }
  get meal(): MealSlotType { return this.props.meal; }
  get recipeId(): string { return this.props.recipeId; }
  get servings(): number { return this.props.servings; }
  get position(): number { return this.props.position; }
  get foodLogEntryId(): string | null { return this.props.foodLogEntryId; }
  get createdAt(): Date { return this.props.createdAt; }
  get updatedAt(): Date { return this.props.updatedAt; }
}
