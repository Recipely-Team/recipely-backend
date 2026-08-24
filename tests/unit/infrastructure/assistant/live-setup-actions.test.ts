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

/** Not an action — the tool the actions are passed to. */
const NOT_AN_ACTION = new Set(['runAction']);

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
});
