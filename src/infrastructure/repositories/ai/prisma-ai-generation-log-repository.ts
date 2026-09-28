import type { PrismaClient } from '@prisma/client';
import { fail, ok, type Result } from '@core/result/result';
import { UnknownFailure, type Failure } from '@core/failure';
import { AIGenerationLog } from '@domain/ai/ai-generation-log';
import type { AIGenerationLogRepositoryInterface } from '@domain/ai/ai-generation-log-repository-interface';
import type { GenerationHistoryInterface } from '@application/ai/ports/generation-history-interface';
import { AIGenerationStatus } from '@domain/ai/ai-generation-status';
import { pinoInstance as logger } from '@infrastructure/logger/pino-logger';

export class PrismaAIGenerationLogRepository implements AIGenerationLogRepositoryInterface, GenerationHistoryInterface {
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
  /** Never throws: an unreadable log costs the AI mark, not the recipe being saved. */
  async hasGenerated(userId: string, prompt: string): Promise<boolean> {
    try {
      const hit = await this.prisma.aIGenerationLog.findFirst({
        where: { userId, userPrompt: prompt, status: AIGenerationStatus.Success },
        select: { id: true },
      });
      return hit !== null;
    } catch (err) {
      logger.warn({ err: errorMessage(err) }, 'ai_generation_log_lookup_failed');
      return false;
    }
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown repository error';
}
