import { foldText } from '@domain/common/fold-text';

/**
 * Salt, pepper, cooking oil and water in the app's languages — what every
 * kitchen is assumed to have, so a fridge idea never lists them as missing.
 *
 * @remarks
 * The prompt already tells the model so; this is the backstop for when it
 * does not listen. Exact matches after {@link foldText}, never substrings:
 * "red pepper" is a vegetable, "pepper" here is the spice.
 */
const STAPLES = [
  'salt', 'pepper', 'black pepper', 'oil', 'olive oil', 'vegetable oil', 'cooking oil', 'water',
  'tuz', 'karabiber', 'yag', 'sivi yag', 'zeytinyagi', 'su',
  'salz', 'pfeffer', 'ol', 'olivenol', 'wasser',
  'sal', 'pimienta', 'aceite', 'aceite de oliva', 'agua',
  'sel', 'poivre', 'huile', "huile d'olive", 'eau',
  'sale', 'pepe', 'olio', "olio d'oliva", 'acqua',
  'pimenta', 'oleo', 'azeite', 'agua',
  'соль', 'черныи перец', 'масло растительное', 'растительное масло', 'вода',
  'garam', 'merica', 'minyak', 'minyak goreng', 'air',
  'नमक', 'काली मिर्च', 'तेल', 'पानी',
  'ملح', 'فلفل اسود', 'زيت', 'ماء',
  '塩', 'こしょう', '胡椒', '油', 'サラダ油', '水',
  '소금', '후추', '식용유', '기름', '물',
  '盐', '胡椒粉', '食用油', '水',
].map(foldText);

const STAPLE_SET: ReadonlySet<string> = new Set(STAPLES);

export function isPantryStaple(name: string): boolean {
  return STAPLE_SET.has(foldText(name.trim()));
}
