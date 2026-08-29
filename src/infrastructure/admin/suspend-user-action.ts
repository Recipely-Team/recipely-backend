import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';

interface SuspendUserActionRequest {
  method?: string;
  params?: { recordId?: string };
  payload?: { reason?: unknown };
}

interface SuspendUserActionRecord {
  toJSON: (currentAdmin?: unknown) => unknown;
}

interface SuspendUserActionContext {
  record?: SuspendUserActionRecord;
  currentAdmin?: { id?: string };
}

export interface SuspendUserActionResponse {
  record?: unknown;
  notice?: { message: string; type: 'success' | 'error' };
}

// Suspend is the one User action carrying a payload (the reason), which is why
// it isn't built on createModerationActionHandler: approve/reject/unsuspend
// take no input beyond the record id. The reason is typed into the
// SuspendUserAction component and arrives here as request.payload, same as an
// AdminJS edit form submission.
export function createSuspendUserActionHandler(
  run: (recordId: string, reason: string | undefined) => Promise<Result<unknown, Failure>>,
  successMessage: string,
): (
  request: SuspendUserActionRequest,
  response: unknown,
  context: SuspendUserActionContext,
) => Promise<SuspendUserActionResponse> {
  return async (request, _response, context) => {
    const recordId = request.params?.recordId;
    const { record, currentAdmin } = context;

    if (request.method === 'get' || recordId === undefined) {
      return { record: record?.toJSON(currentAdmin) };
    }

    const rawReason = request.payload?.reason;
    const reason = typeof rawReason === 'string' && rawReason.trim().length > 0 ? rawReason.trim() : undefined;

    const result = await run(recordId, reason);

    if (!result.ok) {
      return {
        record: record?.toJSON(currentAdmin),
        notice: { message: result.failure.messageKey, type: 'error' },
      };
    }

    return {
      record: record?.toJSON(currentAdmin),
      notice: { message: successMessage, type: 'success' },
    };
  };
}
