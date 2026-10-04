const TURKISH_DOTTED = /[İI]/g;
const TURKISH_LETTERS: Readonly<Record<string, string>> = { ı: 'i', ç: 'c', ğ: 'g', ö: 'o', ş: 's', ü: 'u' };
const DIACRITICS = /\p{M}/gu;

/**
 * **Text reduced to the alphabet people type**: the same folding the search
 * SQL applies (`İ`/`I` → `i` before lowercasing, `ıçğöşü` → `icgosu`), plus
 * every other combining accent dropped — so "TARİF", "tarif" and "tarıf"
 * compare equal, as do "Café" and "cafe".
 */
export function foldText(text: string): string {
  return text
    .replace(TURKISH_DOTTED, 'i')
    .toLowerCase()
    .replace(/[ıçğöşü]/g, (letter) => TURKISH_LETTERS[letter] ?? letter)
    .normalize('NFD')
    .replace(DIACRITICS, '');
}
