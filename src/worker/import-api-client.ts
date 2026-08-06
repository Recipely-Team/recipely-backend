import type { GeneratedRecipeDto } from '@application/ai/dtos/generated-recipe.dto';

export interface ClaimedJob {
  readonly jobId: string;
  readonly url: string;
  readonly locale: string;
}

export interface ImportApiClientOptions {
  readonly baseUrl: string;
  readonly sharedSecret: string;
  readonly workerId: string;
  readonly requestTimeoutMs: number;
}

/** 204: the queue was empty. Not an error, and carries no body to parse. */
const HTTP_NO_CONTENT = 204;

/**
 * The worker's only way to reach the rest of the system.
 *
 * @remarks
 * - **Three calls, no database.** Claim, complete, fail. A worker holds no
 *   `DATABASE_URL`, is not on the API's network and shares no disk with it, so
 *   a worker box can live in another account, another region or another
 *   provider, and losing one costs nothing but throughput.
 * - **The secret goes in a header, never a query string.** URLs are logged by
 *   every proxy in the path; headers are not.
 * - **Every request is bounded.** Without a timeout a hung connection parks the
 *   worker forever: it holds a claim it will never report on, and the job is
 *   only recovered when the lease expires. Failing fast returns the box to the
 *   pool in seconds instead of minutes.
 */
export class ImportApiClient {
  constructor(private readonly options: ImportApiClientOptions) {}

  private headers(): Record<string, string> {
    return {
      'content-type': 'application/json',
      'x-worker-secret': this.options.sharedSecret,
      'x-worker-id': this.options.workerId,
    };
  }

  private async post(path: string, body?: unknown): Promise<Response> {
    const res = await fetch(`${this.options.baseUrl}${path}`, {
      method: 'POST',
      headers: this.headers(),
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(this.options.requestTimeoutMs),
    });

    if (!res.ok) {
      // The body may explain, but it may also be an nginx error page. Read a
      // bounded amount so a misrouted request cannot pull a large response
      // into memory on a 1 GB box.
      const detail = (await res.text().catch(() => '')).slice(0, 500);
      throw new Error(`${path} responded ${res.status}: ${detail}`);
    }
    return res;
  }

  /** Takes the next job, or `null` when there is nothing to do. */
  async claim(): Promise<ClaimedJob | null> {
    const res = await this.post('/internal/import-jobs/claim');
    if (res.status === HTTP_NO_CONTENT) return null;
    return (await res.json()) as ClaimedJob;
  }

  async complete(
    jobId: string,
    payload: {
      recipe: GeneratedRecipeDto;
      coverFrameJpegBase64: string | null;
      locale: string;
    },
  ): Promise<void> {
    await this.post(`/internal/import-jobs/${jobId}/complete`, payload);
  }

  async fail(jobId: string, errorKey: string): Promise<void> {
    await this.post(`/internal/import-jobs/${jobId}/fail`, { errorKey });
  }
}
