import { mapResult, type Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { DmRuleRepositoryInterface } from '@domain/instagram/dm-rule-repository-interface';
import type { DmRuleDto } from '@application/instagram/dtos/dm-rule.dto';
import { InstagramMapper } from '@application/instagram/mappers/instagram.mapper';

/** A stored rule read back as its owner's list shows it (sent count, recipe). */
export async function ruleDto(rules: DmRuleRepositoryInterface, id: string, userId: string, locale: string): Promise<Result<DmRuleDto, Failure>> {
  return mapResult(await rules.findListData(id, userId), (data) => InstagramMapper.rule(data, locale));
}
