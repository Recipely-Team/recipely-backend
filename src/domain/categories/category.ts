import { Entity } from '@core/entity/entity';
import { fail, ok, type Result } from '@core/result/result';
import { ValidationFailure } from '@core/failure';

type LocalizedString = Record<string, string>;

export interface CategoryProps {
  id: string;
  slug: string;
  name: LocalizedString;
  cuisine: LocalizedString;
  createdAt: Date;
}

export interface LocalizedCategory {
  name: string;
  cuisine: string;
}

export class Category extends Entity<CategoryProps> {
  private constructor(props: CategoryProps) {
    super(props);
  }

  static create(props: CategoryProps): Result<Category, ValidationFailure> {
    if (props.id.trim().length === 0) {
      return fail(new ValidationFailure('errors.validation.id_required', 'id'));
    }
    if (props.slug.trim().length === 0) {
      return fail(new ValidationFailure('errors.validation.slug_required', 'slug'));
    }
    const nameObj = props.name as unknown as Record<string, string>;
    if (!nameObj || Object.keys(nameObj).length === 0 || Object.values(nameObj).every(v => v.trim().length === 0)) {
      return fail(new ValidationFailure('errors.validation.category_name_required', 'name'));
    }
    return ok(new Category(props));
  }

  localize(locale: string): LocalizedCategory {
    return {
      name: this.props.name[locale] ?? this.props.name['en'] ?? Object.values(this.props.name)[0] ?? '',
      cuisine: this.props.cuisine[locale] ?? this.props.cuisine['en'] ?? Object.values(this.props.cuisine)[0] ?? '',
    };
  }

  get slug(): string { return this.props.slug; }
  get createdAt(): Date { return this.props.createdAt; }
}