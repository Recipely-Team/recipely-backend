import { AssistantAction } from '@domain/assistant/assistant-action';
import { ASSISTANT_SYSTEM_INSTRUCTION, assistantTools } from '@infrastructure/assistant/live-setup';

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
