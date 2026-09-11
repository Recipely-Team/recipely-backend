import type { HttpErrorBody } from '@presentation/http/http-error-body';

export interface HttpErrorResponse {
  readonly status: number;
  readonly body: HttpErrorBody;
}
