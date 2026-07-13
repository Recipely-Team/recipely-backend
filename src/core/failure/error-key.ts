/**
 * The single source of truth for every error a client can be told about.
 *
 * A {@link Failure} may only carry a key from this catalogue, which makes
 * `new UnknownFailure('Corrupt recipe row 7')` a compile-time error rather than
 * an information leak at the HTTP edge. Technical detail (exception text, row
 * ids, Zod issue lists) belongs in `Failure.debug` and the logs — never here.
 *
 * Every key MUST have a translation in all six `src/locales/errors/*.json`
 * files; `failureToHttp` fails closed to `errors.internal.unexpected` for any
 * key it cannot translate, so a key added here but not there degrades to the
 * generic message instead of leaking.
 */
export const ERROR_KEYS = [
  // Internal — the only thing a client is ever told about a server-side defect.
  'errors.internal.unexpected',

  // Request shape / payload
  'errors.validation.invalid_request',
  'errors.validation.invalid_json',
  'errors.validation.encrypted_envelope_required',
  'errors.validation.decryption_failed',
  'errors.validation.missing_field',

  // Uploads
  'errors.validation.file_required',
  'errors.validation.file_type_invalid',
  'errors.validation.file_too_large',
  'errors.validation.unsupported_image_type',
  'errors.upload.failed',

  // Identity / profile
  'errors.validation.email_invalid',
  'errors.validation.display_name_required',
  'errors.validation.user_id_required',
  'errors.validation.password_too_short',
  'errors.validation.provider_required',
  'errors.validation.token_required',
  'errors.validation.token_expired',
  'errors.validation.token_already_used',
  'errors.validation.platform_invalid',

  // Registration codes
  'errors.validation.code_invalid',
  'errors.validation.code_expired',
  'errors.validation.code_attempts_exceeded',

  // Recipe fields
  'errors.validation.id_required',
  'errors.validation.name_required',
  'errors.validation.name_too_short',
  'errors.validation.category_invalid',
  'errors.validation.cuisine_required',
  'errors.validation.difficulty_invalid',
  'errors.validation.ingredients_required',
  'errors.validation.instructions_required',
  'errors.validation.prep_time_invalid',
  'errors.validation.cook_time_invalid',
  'errors.validation.servings_invalid',
  'errors.validation.calories_invalid',
  'errors.validation.image_invalid',
  'errors.validation.image_required',
  'errors.validation.rating_invalid',
  'errors.validation.owner_required',
  'errors.validation.author_id_required',
  'errors.validation.recipe_id_required',

  // Comments & feedback
  'errors.validation.body_required',
  'errors.validation.body_too_long',
  'errors.validation.message_required',
  'errors.validation.message_too_long',
  'errors.validation.subject_too_long',

  // Listing / paging
  'errors.validation.page_invalid',
  'errors.validation.page_size_invalid',
  'errors.validation.auth_required_for_liked_only',

  // Social graph
  'errors.validation.cannot_follow_self',

  // AI prompts
  'errors.validation.prompt_required',

  // Legacy generic validation copy (kept for locale compatibility)
  'errors.validation.unauthorized',
  'errors.validation.forbidden',
  'errors.validation.unknown',

  // Not found
  'errors.not_found.route',
  'errors.not_found.user',
  'errors.not_found.recipe',
  'errors.not_found.category',
  'errors.not_found.comment',
  'errors.not_found.draft',
  'errors.not_found.follow',
  'errors.not_found.notification',
  'errors.not_found.pending_registration',
  'errors.not_found.reset_token',

  // Conflict
  'errors.conflict.email_exists',
  'errors.conflict.recipe_exists',
  'errors.conflict.already_following',

  // Authorization
  'errors.unauthorized.missing_token',
  'errors.unauthorized.invalid_token',
  'errors.unauthorized.invalid_credentials',
  'errors.unauthorized.user_not_found',
  'errors.unauthorized.account_deleted',
  'errors.unauthorized.invalid_firebase_token',
  'errors.unauthorized.no_email_in_token',
  'errors.unauthorized.invalid_email_in_token',
  'errors.forbidden',

  // Rate limiting
  'errors.too_many_requests.code_cooldown',
  'errors.too_many_requests.ai_cooldown',

  // Moderation
  'errors.recipe.rejected',
  'errors.comment.rejected',

  // AI
  'errors.ai.upstream_failed',
  'errors.ai.invalid_response',
  'errors.ai.provider_not_configured',
  'errors.ai.prompt_rejected',
  'errors.ai.refine_instruction_required',

  // Instagram import
  'errors.import.invalid_url',
  'errors.import.not_instagram',
  'errors.import.fetch_failed',
  'errors.import.duration_exceeded',
  'errors.import.no_recipe_found',
  'errors.import.busy',
] as const;

export type ErrorKey = typeof ERROR_KEYS[number];

const ERROR_KEY_SET: ReadonlySet<string> = new Set<string>(ERROR_KEYS);

/** Guards the HTTP edge: anything not in the catalogue must never reach a client. */
export function isErrorKey(value: string): value is ErrorKey {
  return ERROR_KEY_SET.has(value);
}
