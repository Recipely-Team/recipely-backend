/**
 * Every bound on the fridge scan and the idea request, in one place.
 *
 * @remarks
 * - **`dailyPerUser`** is the cost cap, shared by scans and idea requests:
 *   each is one model call (a scan moderates every photo first).
 * - **Photos** follow the meal parse's upload rules; three is enough for a
 *   fridge door, a shelf and the pantry.
 * - **`ideaMinutes`** are the only "max time" filters the app offers.
 */
export const FridgeLimits = {
  dailyPerUser: 20,
  maxPhotos: 3,
  maxScanIngredients: 30,
  ingredientMaxChars: 40,
  maxIdeaIngredients: 40,
  maxExcluded: 12,
  excludedMaxChars: 120,
  ideasPerRequest: 3,
  titleMaxChars: 80,
  summaryMaxChars: 140,
  maxMissing: 5,
  maxServings: 12,
  ideaMinutes: [15, 30, 60] as const,
  maxTotalMinutes: 600,
} as const;
