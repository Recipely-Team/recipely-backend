import { AssistantAction } from '@domain/assistant/assistant-action';
import { ASSISTANT_SYSTEM_INSTRUCTION, assistantToolDefinitions, assistantTools } from '@infrastructure/assistant/assistant-persona';

/**
 * The instruction told the model to call `duplicateRecipe` and the enum it
 * chooses from did not contain the word.
 *
 * The app had implemented the action, the instruction had been written for it,
 * and the one list the model actually picks from was never touched — so the
 * only thing the model could do with "make the same recipe" was the thing that
 * change existed to stop. Nothing failed anywhere: an instruction is prose to
 * everything except the model.
 */

/**
 * Words the instruction uses that are not action names.
 *
 * `runAction` is the tool the actions are passed to. The rest are argument
 * VALUES: the instruction now spells out which actions take a fixed word
 * rather than the user's own, because told only "verbatim" the model sent
 * Turkish where an enum was expected and "en üste kaydır" arrived as `up`.
 * Those values are camelCase too, so the guard has to be told them — the
 * alternative was to stop naming them, which is the thing that caused the bug.
 */
const NOT_AN_ACTION = new Set(['runAction', 'maxTime', 'mostLiked']);

const ACTION_SHAPED = /\b[a-z]+[A-Z][A-Za-z]*\b/g;

describe('the assistant vocabulary', () => {
  it('offers every action its own instruction names', () => {
    const named = [...ASSISTANT_SYSTEM_INSTRUCTION.matchAll(ACTION_SHAPED)]
      .map((match) => match[0])
      .filter((word) => !NOT_AN_ACTION.has(word));
    const offered = new Set<string>(Object.values(AssistantAction));

    expect(named.length).toBeGreaterThan(0);
    expect(named.filter((word) => !offered.has(word))).toEqual([]);
  });

  it('puts the whole vocabulary in the tool the model calls', () => {
    const declarations = assistantTools().flatMap(
      (tool) => tool.functionDeclarations as Record<string, unknown>[],
    );
    const enums = declarations.map(
      (declaration) =>
        (declaration.parameters as { properties: { action: { enum: string[] } } }).properties.action
          .enum,
    );

    expect(enums).toEqual([Object.values(AssistantAction)]);
  });

  /**
   * `readIngredients` was implemented in the app and missing from this list for
   * its whole life — the silent half of the failure this file exists for. A
   * word the app answers and the model is never told about is simply never
   * spoken, and nothing anywhere reports it.
   *
   * These three are named one by one on purpose: the test above compares the
   * enum against this object, so dropping a member from the object satisfies
   * both sides of it.
   */
  it('offers the words a user reaches for when they cannot see the screen', () => {
    const offered = new Set<string>(Object.values(AssistantAction));

    expect(offered.has('readScreen')).toBe(true);
    expect(offered.has('readIngredients')).toBe(true);
    expect(offered.has('reportProblem')).toBe(true);
  });
});

/**
 * The Food Diary's words, as `docs/diary-assistant-contract.md` in the app repo
 * spells them. The app dispatches on these exact strings, so each is named one
 * by one — comparing the enum against the object that builds it would pass
 * with any of them missing.
 */
describe('the diary vocabulary', () => {
  const DIARY_ACTIONS = [
    'selectDate',
    'logFood',
    'logMeal',
    'searchFood',
    'removeFood',
    'changeFood',
    'addWater',
    'setGoals',
    'openGoals',
    'openAddFood',
  ];

  const argDescription = (): string => {
    const [runAction] = assistantToolDefinitions();
    return (runAction?.parameters as { properties: { arg: { description: string } } }).properties.arg
      .description;
  };

  it('offers every diary action', () => {
    const offered = new Set<string>(Object.values(AssistantAction));
    expect(DIARY_ACTIONS.filter((word) => !offered.has(word))).toEqual([]);
  });

  // Without the names navigate rejected every screen the model invented.
  it('lists the diary screens among navigate targets', () => {
    expect(argDescription()).toMatch(/For navigate it is one of: [^.]*\bdiary, diaryCalendar\./);
  });

  it('spells out the argument shape of every diary action that takes one', () => {
    for (const word of ['selectDate', 'logFood', 'removeFood', 'changeFood', 'addWater', 'setGoals', 'searchFood', 'openAddFood']) {
      expect(argDescription()).toContain(word);
    }
    expect(argDescription()).toContain('PER SERVING');
  });

  // "Su içtim" is not a number, and a guessed glass is a wrong entry the user
  // has to find and undo.
  it('tells the model to ask for a water amount it was not given', () => {
    expect(ASSISTANT_SYSTEM_INSTRUCTION).toMatch(/does not say how much[^.]*ASK how many glasses/);
    expect(ASSISTANT_SYSTEM_INSTRUCTION).toContain('Never assume one.');
  });

  it('tells the model how to compute goals from what the user says about themselves', () => {
    expect(ASSISTANT_SYSTEM_INSTRUCTION).toContain('Mifflin-St Jeor');
    expect(ASSISTANT_SYSTEM_INSTRUCTION).toContain('then call setGoals');
  });
});
