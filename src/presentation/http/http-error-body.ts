export interface HttpErrorBody {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly messageKey?: string;
    readonly field?: string;
    /** Structured context a failure chose to expose, e.g. `{ blockers: [...] }`. */
    readonly details?: Readonly<Record<string, unknown>>;
  };
}
