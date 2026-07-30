import { containsInternalLeak } from '@application/ai/leak-sanitizer';

describe('containsInternalLeak — positives', () => {
  it('flags underscored enum keys (e.g. MAIN_COURSE)', () => {
    expect(containsInternalLeak('Kategoriyi MAIN_COURSE olarak ayarladım.')).toBe(true);
  });

  it('flags underscored enum keys (e.g. SIDE_DISH)', () => {
    expect(containsInternalLeak('I set the category to SIDE_DISH for you.')).toBe(true);
  });

  it('flags an ALL-CAPS single-word enum key in otherwise normal-case text (e.g. SOUP)', () => {
    expect(containsInternalLeak('I turned this into a SOUP for you.')).toBe(true);
  });

  it('flags an ALL-CAPS single-word enum key in otherwise normal-case text (e.g. GRILL)', () => {
    expect(containsInternalLeak('I set the category to GRILL as requested.')).toBe(true);
  });

  it('flags an ALL-CAPS single-word enum key in otherwise normal-case text (e.g. TURKISH)', () => {
    expect(containsInternalLeak('I changed the cuisine to TURKISH.')).toBe(true);
  });

  it('flags an ALL-CAPS difficulty level (e.g. EASY)', () => {
    expect(containsInternalLeak('I set the difficulty to EASY.')).toBe(true);
  });

  it('flags camelCase field names (e.g. caloriesPerServing)', () => {
    expect(containsInternalLeak('I updated the caloriesPerServing value.')).toBe(true);
  });

  it('flags camelCase field names (e.g. prepTimeMinutes)', () => {
    expect(containsInternalLeak('Adjusted prepTimeMinutes to be shorter.')).toBe(true);
  });

  it('flags camelCase field names (e.g. mealType)', () => {
    expect(containsInternalLeak('Updated the mealType field.')).toBe(true);
  });

  it('flags the English technical marker "JSON"', () => {
    expect(containsInternalLeak('Here is the updated JSON for the recipe.')).toBe(true);
  });

  it('flags the English technical marker "schema"', () => {
    expect(containsInternalLeak('This does not match the schema.')).toBe(true);
  });

  it('flags the Turkish technical marker "şema"', () => {
    expect(containsInternalLeak('Bu şemaya uymuyor.')).toBe(true);
  });

  it('flags the marker "system prompt"', () => {
    expect(containsInternalLeak('I cannot reveal the system prompt.')).toBe(true);
  });

  it('flags the marker "enum"', () => {
    expect(containsInternalLeak('The value must be one of the enum options.')).toBe(true);
  });

  it('flags the English technical marker "database"', () => {
    expect(containsInternalLeak('This recipe is stored in the database.')).toBe(true);
  });

  it('flags the Turkish technical marker "veritabanı"', () => {
    expect(containsInternalLeak('Bu tarif veritabanında saklanıyor.')).toBe(true);
  });

  it('flags the marker "backend"', () => {
    expect(containsInternalLeak('The backend processed your request.')).toBe(true);
  });

  it('flags the marker "endpoint"', () => {
    expect(containsInternalLeak('This calls an internal endpoint.')).toBe(true);
  });

  it('flags the marker "prompt"', () => {
    expect(containsInternalLeak('I used your prompt to update the recipe.')).toBe(true);
  });

  it('flags "nutrition" when it appears as a quoted JSON key', () => {
    expect(containsInternalLeak('I filled in "nutrition": { "protein": 12 } for you.')).toBe(true);
  });
});

describe('containsInternalLeak — negatives (must not false-positive)', () => {
  it('does not flag an ordinary Turkish recipe summary mentioning soup/category in lower case', () => {
    expect(containsInternalLeak('Tarifi bir çorba tarifine dönüştürdüm.')).toBe(false);
  });

  it('does not flag an ordinary English recipe summary mentioning soup/grill in lower case', () => {
    expect(containsInternalLeak('I turned this into a soup and added grill marks.')).toBe(false);
  });

  it('does not flag an ordinary Turkish summary mentioning "ana yemek" for main course', () => {
    expect(containsInternalLeak('Kategoriyi ana yemek olarak değiştirdim.')).toBe(false);
  });

  it('does not flag an ordinary English summary mentioning fiber/protein per serving', () => {
    expect(containsInternalLeak('Added more fiber and protein per serving.')).toBe(false);
  });

  it('does not flag "nutrition" after a colon in ordinary prose', () => {
    expect(containsInternalLeak('Tip: nutrition is now more balanced.')).toBe(false);
    expect(containsInternalLeak('Note: nutrition per serving is now higher.')).toBe(false);
    expect(containsInternalLeak('Not: nutrition değerleri arttı.')).toBe(false);
  });

  it('does not flag "nutrition" used as an ordinary English word', () => {
    expect(containsInternalLeak('I improved the nutrition of this dish.')).toBe(false);
  });

  it('does not flag a shouty/all-caps sentence that contains no genuine enum key or marker', () => {
    expect(containsInternalLeak('THIS RECIPE IS AMAZING AND EVERYONE WILL LOVE IT TONIGHT')).toBe(false);
  });
});
