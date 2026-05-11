import type { PrismaClient } from '@prisma/client';
import { fail, ok, type Result } from '@core/result/result';
import { UnknownFailure, type Failure } from '@core/failure';
import { AIGenerationLog } from '@domain/ai/ai-generation-log';
import type { IAIGenerationLogRepository } from '@domain/ai/i-ai-generation-log-repository';
import { logger } from '@presentation/server/logger';

export class PrismaAIGenerationLogRepository implements IAIGenerationLogRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(log: AIGenerationLog): Promise<Result<AIGenerationLog, Failure>> {
    try {
      const raw = log.toRaw();
      await this.prisma.aIGenerationLog.create({
        data: {
          id: raw.id,
          userId: raw.userId,
          userPrompt: raw.userPrompt,
          generatedRecipeId: raw.generatedRecipeId,
          provider: raw.provider,
          modelUsed: raw.modelUsed,
          status: raw.status,
          errorMessage: raw.errorMessage,
          createdAt: raw.createdAt,
        },
      });
      return ok(log);
    } catch (err) {
      const message = errorMessage(err);
      // Audit writes are best-effort in the use case, so without this the
      // failure would be silent — log it here for observability.
      logger.error({ err: message, logId: log.id }, 'ai_generation_log_write_failed');
      return fail(new UnknownFailure(message));
    }
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown repository error';
}
