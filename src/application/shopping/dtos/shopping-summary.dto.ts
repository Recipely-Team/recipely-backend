/** `GET /me/shopping-list/summary` — the cart badge's count. */
export interface ShoppingSummaryDto {
  /** Items not yet ticked. */
  readonly unchecked: number;
}
