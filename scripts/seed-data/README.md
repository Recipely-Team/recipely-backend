# World recipe seed

## Why the recipes here carry no licence note

A list of ingredients is not copyrightable — in the US (`Publications
International v. Meredith`, 7th Cir. 1996) and equivalently in Turkey and the
EU, where a bare list of materials is a fact rather than an expression. What IS
protected is the prose: the descriptive text, the headnotes, the photographs.

So every recipe in `world-recipes.ts` is a dish the world already knows, with
its ingredients stated plainly and its method **written from scratch for this
file**. Nothing is copied. That is the only way to be certain, and it is
cheaper than auditing a licence per recipe.

## Why the images carry no attribution

Images are fetched from Openverse filtered to `cc0` (CC0 1.0) and `pdm` (Public
Domain Mark) only — the two licences that require **no attribution**. Anything
under CC BY, BY-SA or NC is skipped rather than attributed, because an app that
must display a photographer credit beside every card is a different product.

The licence, the source URL and the Openverse id are recorded per image in
`seeded-images.json` so a claim can be answered with provenance, even though
none is legally required.

## Ratings

Seeded recipes are inserted with `rating = 0`. A rating is what users think; a
number written here would be a claim about people who have not seen the dish.

## Two ways this loaded rows with nothing behind them

Both were found only by looking at the running site, so they are written down
and each now has a check that stops the run instead of a person noticing later.

- **59 rows naming 59 photographs that were not there.** A slug already in
  `seeded-images.json` skips its download, and the download was also the step
  that put the file in the `--emit` folder. The second emit therefore produced
  SQL naming every image and a folder holding none. Photographs now land in a
  cache (`public/uploads`, gitignored) and are *copied* into the emit folder,
  a missing cached file is re-fetched from the Openverse id under its recorded
  name, and the emit refuses to write `seed.sql` if any file it names is absent.
- **Every dish inserted a second time.** `name->>'en'` returns the string inside
  the JSON, and the "already present?" test compared it against a JSON-encoded
  literal — `Pad Thai` against `"Pad Thai"`, never equal. Use `sqlText` for a
  text comparison and `sqlString` only for a JSON column; the emit refuses any
  statement comparing a text column against a JSON-quoted literal. The test now
  matches either language, because a dish stored as "Baked Lasagna" is the same
  dish as "Fırın Lazanya".

## Why the imported recipes were deleted rather than rehosted

Sixteen recipes still showed a picture served by `themealdb.com`. Copying those
files onto our own host would have looked like the fix and been the opposite of
one: TheMealDB's images are submitted by its users, nothing there grants a right
to redistribute them, and serving a copy makes us the publisher rather than
merely the page that links. The recipe text came from the same place, so the
rows went too.

Seven of those dishes are now written here, with a photograph we may use —
teriyaki salmon and chicken, beef wellington, chicken handi, fajitas, chicken
alfredo and pecan pie — and the Spanish tortilla, already written, came off the
waiting list because the search finally found it one. The remaining dishes were
already in this seed under our own text, so deleting the imports simply let the
"already present?" test stop skipping them.
