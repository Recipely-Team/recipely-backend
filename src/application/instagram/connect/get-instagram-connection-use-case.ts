import { mapResult, type Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { InstagramConnectionRepositoryInterface } from '@domain/instagram/instagram-connection-repository-interface';
import type { InstagramConnectionDto } from '@application/instagram/dtos/instagram-connection.dto';
import { InstagramMapper } from '@application/instagram/mappers/instagram.mapper';

/** **`GET /me/instagram`** — the linked account and its token's expiry; never the token. */
export class GetInstagramConnectionUseCase {
  constructor(
    private readonly connections: InstagramConnectionRepositoryInterface,
    private readonly available: boolean,
  ) {}

  async execute(userId: string): Promise<Result<InstagramConnectionDto, Failure>> {
    return mapResult(await this.connections.findByUserId(userId), (connection) => InstagramMapper.connection(connection, this.available));
  }
}
