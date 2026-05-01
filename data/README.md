# Recipe data sources

This directory holds external recipe datasets the import scripts read from. CSVs are gitignored — you fetch them locally before running the import.

## Food.com Kaggle dataset

Source: https://www.kaggle.com/datasets/shuyangli94/food-com-recipes-and-user-interactions

**Manual fetch** (no Kaggle CLI):
1. Sign in to Kaggle.
2. Click **Download** on the dataset page (~500 MB zip).
3. Unzip and copy `RAW_recipes.csv` into this directory:
   ```
   data/RAW_recipes.csv
   ```

**Kaggle CLI fetch:**
```bash
pip install kaggle
# Place ~/.kaggle/kaggle.json with your API token (create one in your Kaggle account settings)
kaggle datasets download -d shuyangli94/food-com-recipes-and-user-interactions \
  -f RAW_recipes.csv -p ./data --unzip
```

## Run the import

After `prisma migrate deploy` and `node prisma/seed.js` (which creates the import bot user):

```bash
npx tsx scripts/import-foodcom.ts --file ./data/RAW_recipes.csv --limit 200
```

`--limit N` caps how many rows are processed. Re-running is idempotent (recipes are upserted on `source_url`).

## License caveat

The Kaggle dataset is published as "CC0: Public Domain" by the uploader, but the underlying recipes were scraped from food.com (a commercial site). The original recipe authors retain copyright over the text and step ordering.

**Use this only for development / portfolio / personal sandbox work.** Before serving recipes from this dataset on a public commercial product, sample carefully, confirm per-recipe license, or replace with seeded content you own. Each imported recipe stores its food.com canonical URL in `source_url` so the upstream attribution is recoverable.
