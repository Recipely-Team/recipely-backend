import { findMicrodataRecipe } from '@infrastructure/imports/web/find-microdata-recipe';
import { jsonLdToRecipe } from '@infrastructure/imports/web/json-ld-to-recipe';

/**
 * The symptom: importing a nefisyemektarifleri.com recipe — Turkey's largest
 * recipe site — said "no recipe found on that page". The site publishes its
 * recipe as microdata, not JSON-LD. The page below keeps the traps the real
 * one has: commenters and a video with their own `name`, a hidden image
 * scope, lazy-loaded images, and the steps as one `<ol>`.
 */
const NEFIS_LIKE = `
<div itemscope itemtype="https://schema.org/Comment">
  <div itemprop="author" itemscope itemtype="https://schema.org/Person"><meta itemprop="name" content="A commenter"/></div>
</div>
<div itemscope itemtype="http://schema.org/Recipe">
  <div style="display:none" itemprop="image" itemscope itemtype="https://schema.org/ImageObject">
    <meta itemprop="url" content="https://i.example.com/menemen.jpg"/>
  </div>
  <meta itemprop="name" content="Menemen Tarifi"/>
  <meta itemprop="recipeCuisine" content="Türk" />
  <div itemprop="nutrition" itemscope itemtype="http://schema.org/NutritionInformation"><meta itemprop="calories" content="502"></div>
  <div itemprop="video" itemscope itemtype="http://schema.org/VideoObject"><meta itemprop="name" content="The video"/></div>
  <div itemprop="author" itemscope itemtype="https://schema.org/Person"><span itemprop="name">Elif</span></div>
  <meta itemprop="recipeYield" content="3"/>
  <span itemprop="prepTime" content="PT10M">10dk</span>
  <span itemprop="cookTime" content="PT15M">15dk</span>
  <ul>
    <li itemprop="recipeIngredient">2 yemek kaşığı sıvı yağ</li>
    <li itemprop="recipeIngredient">3 adet <b>yumurta</b></li>
  </ul>
  <ol itemprop="recipeInstructions">
    <li>Biberleri kavurun.</li>
    <li>Domatesleri ekleyin.<script>track()</script></li>
  </ol>
  <img itemprop="url" src="https://cdn.example.com/1x1.gif" data-lazy-src="https://i.example.com/step.jpg">
</div>`;

describe('findMicrodataRecipe', () => {
  it('reads the name of the recipe scope, never that of a commenter or the video', () => {
    const node = findMicrodataRecipe(NEFIS_LIKE);
    expect(node?.['name']).toBe('Menemen Tarifi');
  });

  it('turns it into a draft with one step per list item', () => {
    const found = jsonLdToRecipe(findMicrodataRecipe(NEFIS_LIKE)!, 'https://www.example.com/menemen/');
    expect(found).not.toBeNull();
    const r = found!.recipe;
    expect(r.ingredients).toEqual(['2 yemek kaşığı sıvı yağ', '3 adet yumurta']);
    expect(r.instructions).toEqual(['Biberleri kavurun.', 'Domatesleri ekleyin.']);
    expect(r.servings).toBe(3);
    expect(r.prepTimeMinutes).toBe(10);
    expect(r.cookTimeMinutes).toBe(15);
    expect(r.caloriesPerServing).toBe(502);
    expect(found!.imageUrl).toBe('https://i.example.com/menemen.jpg');
  });

  it('returns null for a page with no Recipe scope', () => {
    expect(findMicrodataRecipe('<div itemscope itemtype="https://schema.org/Article"><meta itemprop="name" content="x"></div>')).toBeNull();
  });
});

// yemek.com wraps its lists in a second array: [["2 yemek kaşığı ...", ...]].
it('reads ingredient and step lists however deeply the page nested them', () => {
  const node = { '@type': 'Recipe', name: 'Menemen', recipeIngredient: [['a', 'b']], recipeInstructions: [['Bir.', 'İki.']] };
  const r = jsonLdToRecipe(node, 'https://yemek.com/tarif/menemen/')!.recipe;
  expect(r.ingredients).toEqual(['a', 'b']);
  expect(r.instructions).toEqual(['Bir.', 'İki.']);
});
