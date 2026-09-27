import type { MediaType } from '@domain/recipes/media-type';
import type { FocusDto } from '@application/recipes/dtos/focus.dto';

export interface MediaDto {
  readonly id: string;
  readonly type: MediaType;
  readonly url: string;
  readonly position: number;
  /** Where to centre a crop of this photo; absent means centred. */
  readonly focus?: FocusDto;
}
