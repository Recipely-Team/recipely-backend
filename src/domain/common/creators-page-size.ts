/**
 * Page size of `GET /users/creators` when the client names none, and the most
 * one page may hold (a larger request is capped, not refused). Beside
 * `PageResult` because both the use case and the query validator read it.
 */
export const CREATORS_PAGE_SIZE = { default: 20, max: 50 } as const;
