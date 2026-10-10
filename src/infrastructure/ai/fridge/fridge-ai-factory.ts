import type { FridgeScannerInterface } from '@application/fridge/ports/fridge-scanner-interface';
import type { FridgeIdeaGeneratorInterface } from '@application/fridge/ports/fridge-idea-generator-interface';
import type { ApiKeyPool } from '@infrastructure/ai/keys/api-key-pool';
import { VisionModels } from '@infrastructure/ai/vision-models';
import type { FridgeModelInterface } from '@infrastructure/ai/fridge/fridge-model-interface';
import { GeminiFridgeModel } from '@infrastructure/ai/fridge/gemini-fridge-model';
import { GroqFridgeModel } from '@infrastructure/ai/fridge/groq-fridge-model';
import { ModelFridgeChain } from '@infrastructure/ai/fridge/model-fridge-chain';

export interface FridgeAiFactoryInput {
  readonly geminiKeys: ApiKeyPool;
  readonly groqKeys: ApiKeyPool;
  /** `GEMINI_MODEL_NAME` / `GROQ_MODEL_NAME` — text models; photos go to {@link VisionModels}. */
  readonly geminiTextModel: string;
  readonly groqTextModel: string;
}

/** Reading a photo wants the same answer twice; ideas want variety on a second ask. */
const SCAN_TEMPERATURE = 0;
const IDEAS_TEMPERATURE = 0.8;

function chain(input: FridgeAiFactoryInput, temperature: number): ModelFridgeChain {
  const models: FridgeModelInterface[] = [];
  if (input.geminiKeys.size > 0) {
    models.push(new GeminiFridgeModel(input.geminiKeys, input.geminiTextModel, VisionModels.gemini, temperature));
  }
  if (input.groqKeys.size > 0) {
    models.push(new GroqFridgeModel(input.groqKeys, input.groqTextModel, VisionModels.groq, temperature));
  }
  return new ModelFridgeChain(models);
}

/**
 * The fridge scanner and idea generator over the providers that hold keys:
 * Gemini first, Groq last — the order every AI chain here uses. Both
 * providers' vision models are the ones {@link VisionModels} names.
 */
export function createFridgeAi(input: FridgeAiFactoryInput): {
  readonly scanner: FridgeScannerInterface;
  readonly ideas: FridgeIdeaGeneratorInterface;
} {
  return { scanner: chain(input, SCAN_TEMPERATURE), ideas: chain(input, IDEAS_TEMPERATURE) };
}
