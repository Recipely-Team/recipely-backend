export interface IRecipe {
  id: string;
  name: string;
  cuisine: string;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  ingredients: string[];
  instructions: string[];
  prepTimeMinutes: number;
  cookTimeMinutes: number;
  image: string;
  rating: number;
  tags: string[];
  mealType: string[];
  isPublished: boolean;
  ownerId: string;
  categoryId: string | null;
  createdAt: string;
  updatedAt: string;
  owner?: { id: string; email: string; displayName: string };
  category?: { id: string; name: string };
}
