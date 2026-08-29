import type { DeleteCommentUseCase } from '@application/comments/use-cases/delete-comment-use-case';

interface CommentDeleteRequest {
  method?: string;
  params?: { recordId?: string };
}

interface CommentDeleteRecord {
  toJSON: (currentAdmin?: unknown) => unknown;
}

interface CommentDeleteContext {
  record?: CommentDeleteRecord;
  currentAdmin?: { id?: string };
  h?: { resourceUrl: (opts: { resourceId: string }) => string };
  resource?: { id: () => string };
}

export interface CommentDeleteActionResponse {
  record?: unknown;
  redirectUrl?: string;
  notice?: { message: string; type: 'success' | 'error' };
}

// Overrides the Comment resource's default `delete` action. A raw Prisma
// delete would desync Recipe.commentCount, which is maintained
// transactionally only inside DeleteCommentUseCase's softDelete call — see
// add-comment-use-case.ts / delete-comment-use-case.ts. The admin acting here
// is neither the comment's author nor the recipe's owner, hence the dedicated
// executeAsAdmin entry point, which skips that ownership guard while still
// routing through the same softDelete + notification-cleanup path the API uses.
export function createCommentDeleteHandler(deleteCommentUseCase: DeleteCommentUseCase) {
  return async (
    request: CommentDeleteRequest,
    _response: unknown,
    context: CommentDeleteContext,
  ): Promise<CommentDeleteActionResponse> => {
    const recordId = request.params?.recordId;
    const { record, currentAdmin, h, resource } = context;

    // Mirrors AdminJS's own DeleteAction: a GET just renders the confirm
    // guard, the actual delete happens on the follow-up POST.
    if (request.method === 'get' || recordId === undefined) {
      return { record: record?.toJSON(currentAdmin) };
    }

    const result = await deleteCommentUseCase.executeAsAdmin(recordId);

    if (!result.ok) {
      return {
        record: record?.toJSON(currentAdmin),
        notice: { message: result.failure.messageKey, type: 'error' },
      };
    }

    return {
      record: record?.toJSON(currentAdmin),
      ...(h && resource ? { redirectUrl: h.resourceUrl({ resourceId: resource.id() }) } : {}),
      notice: { message: 'successfullyDeleted', type: 'success' },
    };
  };
}
