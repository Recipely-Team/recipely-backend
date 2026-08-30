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
 * Nothing is listed that the app does not perform. `writeBio` and `repeat` were
 * in the plan and are gone: a bio is written with `updateProfile`, and
 * repeating a sentence needs no tool. A word the model is offered but nothing
 * answers comes back as a failed call it has to explain away.
 *
 * They are also the model's own reading material: it chooses an action by the
 * meaning of the word, so `unsave` beats `removeFavorite`.
 */
export const AssistantAction = {
  Navigate: 'navigate',
  GoBack: 'goBack',
  OpenRecipe: 'openRecipe',
  OpenDraft: 'openDraft',
  DeleteDraft: 'deleteDraft',
  SwitchTab: 'switchTab',
  Refresh: 'refresh',
  Search: 'search',
  AddFilter: 'addFilter',
  RemoveFilter: 'removeFilter',
  ClearFilters: 'clearFilters',
  Sort: 'sort',
  Confirm: 'confirm',
  Cancel: 'cancel',
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
  RefineDraft: 'refineDraft',
  Regenerate: 'regenerate',
  PublishDraft: 'publishDraft',
  DeleteRecipe: 'deleteRecipe',
  ShareRecipe: 'shareRecipe',
  /** Opens the create screen filled with an existing recipe, to change and re-publish. */
  DuplicateRecipe: 'duplicateRecipe',
  AddComment: 'addComment',
  UpdateProfile: 'updateProfile',
  SetPreference: 'setPreference',
  SignOut: 'signOut',
  MarkAllRead: 'markAllRead',
  /** One notification, chosen by its row or by what the user called it. */
  MarkRead: 'markRead',
  ImportRecipe: 'importRecipe',
  ToggleIngredient: 'toggleIngredient',
  ToggleStep: 'toggleStep',
  StartTimer: 'startTimer',
  PauseTimer: 'pauseTimer',
  ResumeTimer: 'resumeTimer',
  StopTimer: 'stopTimer',
  ReadStep: 'readStep',
  /**
   * Reads the ingredient list aloud — NOT the same as ticking one off.
   *
   * The app has answered this word since the assistant shipped; this list did
   * not offer it, which is the silent half of the failure mode described
   * above. With only `toggleIngredient` to reach for, a model asked to read the
   * ingredients ticked all eleven of them off instead.
   */
  ReadIngredients: 'readIngredients',
  /**
   * Reads out whatever the screen the user is on is showing.
   *
   * Every screen answers it. Without it the model had no word for "what is on
   * this page", so it reached into the recipe vocabulary, was told the recipe
   * actions were unavailable, and concluded out loud that the user must open —
   * or first SAVE — the draft they were already looking at.
   */
  ReadScreen: 'readScreen',
  /**
   * Sends a problem report to the developers, with the failure attached.
   *
   * The app holds the error, the screen and the user's own sentence at the
   * moment this is called. Before it existed, the assistant answered "tell the
   * developer" by describing where the feedback form was.
   */
  ReportProblem: 'reportProblem',
  Scroll: 'scroll',
  Stop: 'stop',
} as const;

export type AssistantActionName = (typeof AssistantAction)[keyof typeof AssistantAction];
