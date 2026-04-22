import type { Request, Response } from 'express';
import type { PrismaClient } from '@prisma/client';
import type { ListFeatureFlagsUseCase } from '@application/feature-flags/use-cases/list-feature-flags-use-case';
import type { UpdateFeatureFlagUseCase } from '@application/feature-flags/use-cases/update-feature-flag-use-case';
import {
  CreateRecipeBodySchema,
  UpdateRecipeBodySchema,
  RecipeIdParamSchema,
  CreateCategoryBodySchema,
  UpdateCategoryBodySchema,
  CategoryIdParamSchema,
  UpdateUserBodySchema,
  UserIdParamSchema,
  DeleteFavoriteBodySchema,
  UpdateFeatureFlagBodySchema,
  FeatureFlagKeyParamSchema,
} from '@presentation/validators/admin.validators';
import { failureToHttp } from '@presentation/http/failure-to-http';
import { fail } from '@core/result/result';
import { ValidationFailure } from '@core/failure';

export class AdminController {
  constructor(
    private readonly listFeatureFlagsUseCase: ListFeatureFlagsUseCase,
    private readonly updateFeatureFlagUseCase: UpdateFeatureFlagUseCase,
    private readonly prisma: PrismaClient,
  ) {}

  // ---------- Recipes ----------

  listRecipes = async (req: Request, res: Response): Promise<void> => {
    const page = Number(req.query.page) || 1;
    const pageSize = Number(req.query.pageSize) || 20;
    const skip = (page - 1) * pageSize;

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.recipe.findMany({
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: { owner: { select: { id: true, email: true, displayName: true } }, category: true },
      }),
      this.prisma.recipe.count(),
    ]);

    res.status(200).json({ items: rows, total, page, pageSize });
  };

  getRecipe = async (req: Request, res: Response): Promise<void> => {
    const { id } = RecipeIdParamSchema.parse(req.params);
    const row = await this.prisma.recipe.findUnique({
      where: { id },
      include: { owner: { select: { id: true, email: true, displayName: true } }, category: true },
    });
    if (!row) {
      const { status, body } = failureToHttp(new ValidationFailure('Recipe not found', 'id'));
      res.status(status).json(body);
      return;
    }
    res.status(200).json(row);
  };

  createRecipe = async (req: Request, res: Response): Promise<void> => {
    const parsed = CreateRecipeBodySchema.safeParse(req.body);
    if (!parsed.success) {
      const { status, body } = failureToHttp(
        new ValidationFailure(parsed.error.message, 'body'),
      );
      res.status(status).json(body);
      return;
    }
    const data: Record<string, unknown> = { ...parsed.data };
    if (parsed.data.categoryId === undefined) delete data.categoryId;
    const row = await this.prisma.recipe.create({ data: parsed.data as any });
    res.status(201).json(row);
  };

  updateRecipe = async (req: Request, res: Response): Promise<void> => {
    const { id } = RecipeIdParamSchema.parse(req.params);
    const parsed = UpdateRecipeBodySchema.safeParse(req.body);
    if (!parsed.success) {
      const { status, body } = failureToHttp(
        new ValidationFailure(parsed.error.message, 'body'),
      );
      res.status(status).json(body);
      return;
    }
    const data: Record<string, unknown> = { ...parsed.data };
    if (parsed.data.categoryId === undefined) data.categoryId = null;
    const row = await this.prisma.recipe.update({ where: { id }, data: parsed.data as any });
    res.status(200).json(row);
  };

  deleteRecipe = async (req: Request, res: Response): Promise<void> => {
    const { id } = RecipeIdParamSchema.parse(req.params);
    await this.prisma.recipe.delete({ where: { id } });
    res.status(204).send();
  };

  // ---------- Categories ----------

  listCategories = async (_req: Request, res: Response): Promise<void> => {
    const rows = await this.prisma.category.findMany({ orderBy: { name: 'asc' } });
    res.status(200).json({ items: rows });
  };

  getCategory = async (req: Request, res: Response): Promise<void> => {
    const { id } = CategoryIdParamSchema.parse(req.params);
    const row = await this.prisma.category.findUnique({ where: { id } });
    if (!row) {
      const { status, body } = failureToHttp(new ValidationFailure('Category not found', 'id'));
      res.status(status).json(body);
      return;
    }
    res.status(200).json(row);
  };

  createCategory = async (req: Request, res: Response): Promise<void> => {
    const parsed = CreateCategoryBodySchema.safeParse(req.body);
    if (!parsed.success) {
      const { status, body } = failureToHttp(
        new ValidationFailure(parsed.error.message, 'body'),
      );
      res.status(status).json(body);
      return;
    }
    const row = await this.prisma.category.create({ data: parsed.data });
    res.status(201).json(row);
  };

  updateCategory = async (req: Request, res: Response): Promise<void> => {
    const { id } = CategoryIdParamSchema.parse(req.params);
    const parsed = UpdateCategoryBodySchema.safeParse(req.body);
    if (!parsed.success) {
      const { status, body } = failureToHttp(
        new ValidationFailure(parsed.error.message, 'body'),
      );
      res.status(status).json(body);
      return;
    }
    const data: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) data.name = parsed.data.name;
    if (parsed.data.slug !== undefined) data.slug = parsed.data.slug;
    const row = await this.prisma.category.update({ where: { id }, data: data as any });
    res.status(200).json(row);
  };

  deleteCategory = async (req: Request, res: Response): Promise<void> => {
    const { id } = CategoryIdParamSchema.parse(req.params);
    await this.prisma.category.delete({ where: { id } });
    res.status(204).send();
  };

  // ---------- Users ----------

  listUsers = async (_req: Request, res: Response): Promise<void> => {
    const rows = await this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: { id: true, email: true, displayName: true, photoUrl: true, role: true, createdAt: true, updatedAt: true },
    });
    res.status(200).json({ items: rows });
  };

  getUser = async (req: Request, res: Response): Promise<void> => {
    const { id } = UserIdParamSchema.parse(req.params);
    const row = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, displayName: true, photoUrl: true, role: true, createdAt: true, updatedAt: true },
    });
    if (!row) {
      const { status, body } = failureToHttp(new ValidationFailure('User not found', 'id'));
      res.status(status).json(body);
      return;
    }
    res.status(200).json(row);
  };

  updateUser = async (req: Request, res: Response): Promise<void> => {
    const { id } = UserIdParamSchema.parse(req.params);
    const parsed = UpdateUserBodySchema.safeParse(req.body);
    if (!parsed.success) {
      const { status, body } = failureToHttp(
        new ValidationFailure(parsed.error.message, 'body'),
      );
      res.status(status).json(body);
      return;
    }
    const data: Record<string, unknown> = {};
    if (parsed.data.displayName !== undefined) data.displayName = parsed.data.displayName;
    if (parsed.data.photoUrl !== undefined) data.photoUrl = parsed.data.photoUrl;
    if (parsed.data.role !== undefined) data.role = parsed.data.role;
    const row = await this.prisma.user.update({ where: { id }, data: data as any });
    res.status(200).json({ id: row.id, email: row.email, displayName: row.displayName, photoUrl: row.photoUrl, role: row.role, createdAt: row.createdAt, updatedAt: row.updatedAt });
  };

  deleteUser = async (req: Request, res: Response): Promise<void> => {
    const { id } = UserIdParamSchema.parse(req.params);
    await this.prisma.user.delete({ where: { id } });
    res.status(204).send();
  };

  // ---------- Favorites ----------

  listFavorites = async (_req: Request, res: Response): Promise<void> => {
    const rows = await this.prisma.favorite.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, email: true, displayName: true } },
        recipe: { select: { id: true, name: true } },
      },
    });
    res.status(200).json({ items: rows });
  };

  deleteFavorite = async (req: Request, res: Response): Promise<void> => {
    const parsed = DeleteFavoriteBodySchema.safeParse(req.body);
    if (!parsed.success) {
      const { status, body } = failureToHttp(
        new ValidationFailure(parsed.error.message, 'body'),
      );
      res.status(status).json(body);
      return;
    }
    await this.prisma.favorite.delete({ where: { userId_recipeId: parsed.data } });
    res.status(204).send();
  };

  // ---------- Feature Flags ----------

  listFeatureFlagsAction = async (_req: Request, res: Response): Promise<void> => {
    const result = await this.listFeatureFlagsUseCase.execute();
    if (!result.ok) {
      const { status, body } = failureToHttp(result.failure);
      res.status(status).json(body);
      return;
    }
    res.status(200).json({ items: result.value });
  };

  updateFeatureFlagAction = async (req: Request, res: Response): Promise<void> => {
    const { key } = FeatureFlagKeyParamSchema.parse(req.params);
    const parsed = UpdateFeatureFlagBodySchema.safeParse(req.body);
    if (!parsed.success) {
      const { status, body } = failureToHttp(
        new ValidationFailure(parsed.error.message, 'body'),
      );
      res.status(status).json(body);
      return;
    }
    const result = await this.updateFeatureFlagUseCase.execute({ key, enabled: parsed.data.enabled });
    if (!result.ok) {
      const { status, body } = failureToHttp(result.failure);
      res.status(status).json(body);
      return;
    }
    res.status(200).json(result.value);
  };
}
