/**
 * Everything the voice assistant may ask the app to do.
 *
 * This list is offered to the model as the `enum` of the single `runAction`
 * tool, and the app dispatches on the same words. The two live in different
 * repositories, so they can only be kept in step deliberately: a word added
 * here that the app does not handle comes back as a failed tool response the
 * model can recover from, while a word the app handles and this list omits is
 * simply never spoken. The first failure mode is loud, the second is silent —
 * which is why this list is the one that leads.
 *
 * They are also the model's own reading material: it chooses an action by the
 * meaning of the word, so `unsave` beats `removeFavorite`.
 */
export const AssistantAction = {
  Navigate: 'navigate',
  OpenRecipe: 'openRecipe',
  Search: 'search',
  Save: 'save',
  Unsave: 'unsave',
  Like: 'like',
  Unlike: 'unlike',
  GenerateRecipe: 'generateRecipe',
  SetDraftField: 'setDraftField',
  AddIngredient: 'addIngredient',
  RemoveIngredient: 'removeIngredient',
  AddStep: 'addStep',
  RemoveStep: 'removeStep',
  AttachPhoto: 'attachPhoto',
  PublishDraft: 'publishDraft',
  DeleteRecipe: 'deleteRecipe',
  AddComment: 'addComment',
  WriteBio: 'writeBio',
  UpdateProfile: 'updateProfile',
  StartTimer: 'startTimer',
  ReadStep: 'readStep',
  Repeat: 'repeat',
  Stop: 'stop',
} as const;

export type AssistantActionName = (typeof AssistantAction)[keyof typeof AssistantAction];
