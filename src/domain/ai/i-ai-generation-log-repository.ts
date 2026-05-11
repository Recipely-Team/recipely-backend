import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { AIGenerationLog } from '@domain/ai/ai-generation-log';

export interface IAIGenerationLogRepository {
  create(log: AIGenerationLog): Promise<Result<AIGenerationLog, Failure>>;
}
