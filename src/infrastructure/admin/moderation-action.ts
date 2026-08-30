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
}

export interface ModerationActionResponse {
  record?: unknown;
  notice?: { message: string; type: 'success' | 'error' };
}

// Shared shape for the Recipe/Comment approve+reject record actions. Mirrors
// createCommentDeleteHandler's get/post split: a GET just renders the record
// (the button itself has no confirm view — see `component: false` on the
// action definitions in adminjs.ts — but the route still answers a GET), the
// decision is applied on the POST.
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

    if (request.method === 'get' || recordId === undefined) {
      return { record: record?.toJSON(currentAdmin) };
    }

    const result = await run(recordId, currentAdmin?.id);

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
