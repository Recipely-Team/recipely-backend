export interface FeedbackDto {
  readonly id: string;
  readonly userId: string;
  readonly category: string;
  readonly subject: string | null;
  readonly message: string;
  readonly rating: number | null;
  readonly contactEmail: string | null;
  readonly status: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}
