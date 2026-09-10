export interface HttpErrorBody {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly messageKey?: string;
    readonly field?: string;
  };
}
