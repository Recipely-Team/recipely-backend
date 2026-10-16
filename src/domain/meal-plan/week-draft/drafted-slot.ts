import type { CalendarDate } from '@domain/diary/calendar-date';
import type { MealSlotType } from '@domain/diary/meal-slot';

/** One meal of a drafted week: the pick, and one swap the user can take instead. Null when nothing fits. */
export interface DraftedSlot {
  readonly date: CalendarDate;
  readonly meal: MealSlotType;
  readonly pickId: string | null;
  readonly alternativeId: string | null;
}
