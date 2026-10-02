import { foldText } from '@domain/common/fold-text';

describe('foldText', () => {
  it.each([
    ['TARİF', 'tarif'],
    ['Tarıf', 'tarif'],
    ['ÇİĞ KÖFTE', 'cig kofte'],
    ['Şeker', 'seker'],
    ['Café crème', 'cafe creme'],
    ['IŞIK', 'isik'],
  ])('%p → %p', (input, expected) => {
    expect(foldText(input)).toBe(expected);
  });
});
