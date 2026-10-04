# Curated recipe fixtures

Two dataset files in the shape `npm run curated:import` reads
(`CuratedRecipeFileSchema` in `src/presentation/validators/curated-recipe.validators.ts`),
used by the curated import tests. Both pass every file-checkable quality gate.

**The FDC ids, gram weights and nutrition values are illustrative.** They are
plausible (the ids point at the right kind of USDA FoodData Central food and the
per-serving values pass the energy check), but they were not pulled from FDC and
must not be imported as real data. The photo credits are placeholders too, and
the two `.jpg` files are 1600×1200 solid-colour images (big enough for the
1200 px photo gate), not photos of the dishes.
