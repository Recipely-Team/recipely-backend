import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';

interface ModerationActionRequest {
  method?: string;
  params?: { recordId?: string };
}

interface ModerationActionRecord {
  toJSON: (currentAdmin?: unknown) => unknown;
}

interface ModerationActionContext {
  record?: ModerationActionRecord;
  currentAdmin?: { id?: string };
  resource?: { findOne: (id: string) => Promise<ModerationActionRecord | null> };
}

export interface ModerationActionResponse {
  record?: unknown;
  notice?: { message: string; type: 'success' | 'error' };
}

// Shared shape for the component-less record actions (approve/reject on
// Recipe, Comment and CreatorTag; unsuspend on User). AdminJS sends such a
// button as a GET (only its built-in `delete` is a POST — see callActionApi in
// adminjs/lib/frontend), so the decision runs on any method; a POST-only check
// here made every one of those buttons a silent no-op. After a success the
// record is re-read, so the page shows the new status and drops the buttons
// that no longer apply without a reload.
export function createModerationActionHandler(
  // `actorId` is the signed-in admin, for actions that record who acted (see
  // unsuspend). Approve/reject ignore it — an extra argument costs them nothing
  // and is cheaper than a second, near-identical handler factory.
  run: (recordId: string, actorId: string | undefined) => Promise<Result<unknown, Failure>>,
  successMessage: string,
): (
  request: ModerationActionRequest,
  response: unknown,
  context: ModerationActionContext,
) => Promise<ModerationActionResponse> {
  return async (request, _response, context) => {
    const recordId = request.params?.recordId;
    const { record, currentAdmin } = context;

    if (recordId === undefined) {
      return { record: record?.toJSON(currentAdmin) };
    }

    const result = await run(recordId, currentAdmin?.id);

    if (!result.ok) {
      return {
        record: record?.toJSON(currentAdmin),
        notice: { message: result.failure.messageKey, type: 'error' },
      };
    }

    const fresh = (await context.resource?.findOne(recordId)) ?? record;
    return {
      record: fresh?.toJSON(currentAdmin),
      notice: { message: successMessage, type: 'success' },
    };
  };
}
