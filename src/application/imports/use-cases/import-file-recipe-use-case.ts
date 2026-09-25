import { randomUUID } from 'crypto';
import { fail, ok, type Result } from '@core/result/result';
import { ValidationFailure, type Failure } from '@core/failure';
import { RecipeDraft } from '@domain/drafts/recipe-draft';
import type { RecipeDraftRepositoryInterface } from '@domain/drafts/recipe-draft-repository-interface';
import { RecipeOrigin } from '@domain/recipes/recipe-origin';
import type { FileRecipeReaderInterface, UploadedRecipeFile } from '@application/ai/ports/file-recipe-reader-interface';

const MAX_IMAGES = 5;
const PDF = 'application/pdf';
const IMAGE_TYPE = /^image\/(?:jpeg|png|webp|heic|heif)$/i;
/** A photo reading takes 10-30 s; past a minute something is wrong. */
const TIMEOUT_MS = 60_000;
/** The draft's prompt field names where it came from; it is never shown as a prompt. */
const FILE_PROMPT = 'file-import';

export interface ImportFileRecipeInput {
  readonly ownerId: string;
  readonly locale: string;
  readonly files: readonly UploadedRecipeFile[];
}

/**
 * Photos of a written recipe, or a PDF, become a draft the owner opens in the
 * editor — the same landing an import has.
 *
 * @remarks
 * - **Up to five photos, or one PDF, never both.** Pages are read in order as
 *   one recipe; a PDF is its own document.
 * - **A draft, not a recipe.** Every recipe is saved privately and published
 *   later; a reading is the start of that, and the owner checks it first.
 * - **Model-written.** The words are the model's reading of the pages, so it
 *   carries the AI mark; no platform, since nothing was fetched from anywhere.
 * - **Synchronous.** A reading takes seconds, not the minute a video needs,
 *   so it does not go through the worker queue.
 */
export class ImportFileRecipeUseCase {
  constructor(
    private readonly reader: FileRecipeReaderInterface,
    private readonly drafts: RecipeDraftRepositoryInterface,
  ) {}

  async execute(input: ImportFileRecipeInput): Promise<Result<{ draftId: string }, Failure>> {
    const pdfs = input.files.filter((f) => f.mimeType === PDF).length;
    const images = input.files.filter((f) => IMAGE_TYPE.test(f.mimeType)).length;
    if (input.files.length === 0) return fail(new ValidationFailure('errors.import.no_file', 'files'));
    if (pdfs + images !== input.files.length) return fail(new ValidationFailure('errors.import.unsupported_file', 'files'));
    if ((pdfs > 0 && images > 0) || pdfs > 1 || images > MAX_IMAGES) {
      return fail(new ValidationFailure('errors.import.too_many_files', 'files'));
    }

    const read = await this.reader.read({ files: input.files, locale: input.locale, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!read.ok) return read;
    const recipe = read.value;

    const now = new Date();
    const draft = RecipeDraft.create({
      id: randomUUID(),
      ownerId: input.ownerId,
      prompt: FILE_PROMPT,
      snapshot: {
        name: recipe.title,
        cuisine: recipe.cuisine,
        category: recipe.category,
        difficulty: recipe.difficulty,
        prepTimeMinutes: recipe.prepTimeMinutes,
        cookTimeMinutes: recipe.cookTimeMinutes,
        servings: recipe.servings,
        ingredients: [...recipe.ingredients],
        instructions: [...recipe.instructions],
        tags: [...recipe.tags],
        mealType: [...recipe.mealType],
        tips: [...recipe.tips],
        caloriesPerServing: recipe.caloriesPerServing,
        nutrition: { ...recipe.nutrition },
        image: '',
        media: [],
        origin: RecipeOrigin.Ai,
        aiWritten: true,
      },
      chatHistory: [],
      createdAt: now,
      updatedAt: now,
    });
    if (!draft.ok) return draft;

    const saved = await this.drafts.upsert(draft.value);
    if (!saved.ok) return saved;
    return ok({ draftId: saved.value.id });
  }
}
