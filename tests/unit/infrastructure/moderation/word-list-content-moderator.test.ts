import { WordListContentModerator } from '@infrastructure/moderation/word-list-content-moderator';

const moderator = new WordListContentModerator();

const generalVerdict = (text: string) => moderator.moderate({ text, context: 'general' });
const recipeVerdict = (text: string) => moderator.moderate({ text, context: 'recipe' });

describe('WordListContentModerator', () => {
  describe('profanity', () => {
    it.each(['sik', 'siktir lan', 'amk', 'orospu', 'yarrak', 'sikerim', 'fuck', 'bitch', 'asshole'])(
      'rejects %p',
      (text) => {
        expect(generalVerdict(text).status).toBe('rejected');
      },
    );

    it('reports the category and matched term', () => {
      const verdict = generalVerdict('sik');
      expect(verdict).toEqual({ status: 'rejected', hit: { category: 'profanity', term: 'sik' } });
    });

    it('approves clean text without a hit', () => {
      expect(generalVerdict('Bu tarif harika olmuş, ellerinize sağlık!')).toEqual({ status: 'approved' });
    });
  });

  describe('obfuscation', () => {
    it.each([
      ['spaced letters', 's i k'],
      ['dot separated', 's.i.k'],
      ['dash separated', 's-i-k'],
      ['repeated letters', 'siiiiik'],
      ['leetspeak s', '5ik'],
      ['leetspeak i', 's1k'],
      ['leetspeak a', '4mk'],
      ['uppercase with Turkish dotted I', 'SİK'],
      ['mixed case', 'SiKtir'],
      // Capital I resolves to dotted "i" for substring rules, so all-caps
      // English profanity stays caught.
      ['all-caps English', 'SHIT'],
      ['all-caps English with I', 'BITCH'],
    ])('catches %s', (_label, text) => {
      expect(generalVerdict(text).status).toBe('rejected');
    });

    // Capital I resolves to "i", so a slur typed in plain ASCII caps — the
    // way people actually type when angry — cannot slip through.
    it.each(['SIK', 'IBNE', 'SPIC', 'CHINK', 'KIKE'])('catches the all-caps slur %p', (text) => {
      expect(generalVerdict(text).status).toBe('rejected');
    });

    it('catches an all-caps dangerous substance in a recipe', () => {
      expect(recipeVerdict('CIVA').status).toBe('rejected');
    });
  });

  // The documented cost of failing closed on the ambiguous capital I: these
  // two innocent Turkish words are homographs of the slur in all caps. Only a
  // standalone token collides — "KAŞIK", "SICAK", "SIKMA" are all fine — and
  // the lowercase spellings people actually write are unaffected.
  describe('known trade-off: all-caps SIK/ŞIK', () => {
    // "SIK SIK" is the adverb "often" — same collision, just twice, so the
    // blast radius of the trade-off is fully pinned here.
    it.each(['SIK', 'ŞIK', 'SIK SIK'])('rejects %p even though it has an innocent reading', (text) => {
      expect(generalVerdict(text).status).toBe('rejected');
    });

    it.each(['limonu sık', 'şık bir tabak', 'sık sık yapıyorum'])('still approves the lowercase spelling %p', (text) => {
      expect(generalVerdict(text)).toEqual({ status: 'approved' });
    });
  });

  describe('false positives (Scunthorpe defense)', () => {
    it.each([
      // Dotless ı is NOT folded to i for whole-word rules, so these common
      // Turkish recipe/everyday words survive.
      'limonu sık',
      'tavuğu iyice sık',
      'portakalı sıkın',
      'sıkma',
      'sıkı',
      'sıkıntı yok',
      'bu elbise çok şık',
      'şıkır şıkır',
      'kaşık',
      'kaşıkla karıştır',
      'ışık',
      'balık',
      'sikke koleksiyonu',
      // All-caps Turkish is only a problem for a token that lands exactly on
      // a listed term (see the caps block below); everything else is clean.
      'KAŞIK',
      'KAŞIKLA KARIŞTIR',
      'SICAK SERVİS YAPIN',
      'IŞIK',
      'BALIK',
      'SIKMA HAMURU',
      'tamam',
      'salam',
      'amasya elması',
      'kaşar peyniri',
      'hıyar turşusu',
      'I am so happy with this',
      'you got this',
      'shrimp cocktail',
      'cumin and cucumber',
      'shiitake',
      'shitake',
      'spicy chicken',
      'torpedo',
      'naked cake',
      'classic assistant',
    ])('approves %p', (text) => {
      expect(generalVerdict(text)).toEqual({ status: 'approved' });
    });
  });

  // The symptom: an AI-written lentil soup could not be saved — "Your content
  // couldn't be saved because it contains inappropriate language." Its step
  // said "add a splash of hot water". Substring rules were matched against the
  // whole text with every space removed, so "hot water" read as "hotwater" and
  // held "twat"; "yaklaşık 150 g" read as "yaklasikisog" (digits leet-folded)
  // and held "sikis". Ten of dev's 295 recipes could no longer be edited.
  // A substring term must now sit inside one word; letter-spaced evasion is
  // still glued back into a word first.
  describe('a substring term never spans two words', () => {
    it.each([
      'Use an immersion blender to puree the soup. If it is too thick, add a splash of hot water.',
      '1 cup hot water',
      'Boil the bones for 10 minutes, throw that water away and rinse them well.',
      'Soak the leaves in salt water.',
      '4 somon fileto (yaklaşık 150 g)',
      // A curated sarma recipe was refused: "sıkı sıra" glued to "sikisira", starting with "sikis".
      'Sarmaları tencereye sıkı sıra dizin.',
    ])('approves %p', (text) => {
      expect(recipeVerdict(text)).toEqual({ status: 'approved' });
    });

    // "sıkış-" (squeeze, pack tightly) folds onto the listed "sikis"; it is a
    // core stuffing verb ("sarmaları sıkışık dizin"), so its forms are safe words.
    it.each(['Tencerenin dibine birkaç yaprak serip sarmaları sıkışık dizin.', 'Hamuru elinizle sıkıştırın.', 'sıkışmış pirinç'])(
      'approves the squeeze verb %p',
      (text) => {
        expect(recipeVerdict(text)).toEqual({ status: 'approved' });
      },
    );

    it.each(['f u c k', 'f.u.c.k', 'motherfucker', 'you twat', 'what a TWAT', 'sikiş'])('still rejects %p', (text) => {
      expect(generalVerdict(text).status).toBe('rejected');
    });
  });

  describe('sexual, hate and csa categories', () => {
    it.each([
      ['porno', 'sexual'],
      ['seks', 'sexual'],
      ['ibne', 'hate'],
      ['faggot', 'hate'],
      ['pedo', 'csa'],
      ['pedofili', 'csa'],
    ])('rejects %p as %s', (text, category) => {
      const verdict = generalVerdict(text);
      expect(verdict.status).toBe('rejected');
      if (verdict.status === 'rejected') expect(verdict.hit.category).toBe(category);
    });
  });

  describe('dangerous substances (recipe context only)', () => {
    it.each(['fare zehri', 'farezehri', 'çamaşır suyu', 'siyanür', 'antifriz', 'tiner', 'kezzap'])(
      'rejects %p in a recipe',
      (text) => {
        const verdict = recipeVerdict(text);
        expect(verdict.status).toBe('rejected');
        if (verdict.status === 'rejected') expect(verdict.hit.category).toBe('dangerous_substance');
      },
    );

    it.each(['fare zehri', 'çamaşır suyu', 'zehir gibi güzel olmuş'])('approves %p outside a recipe', (text) => {
      expect(generalVerdict(text)).toEqual({ status: 'approved' });
    });

    it('approves ordinary recipe text', () => {
      expect(recipeVerdict('2 yemek kaşığı zeytinyağı, sıkılmış limon suyu, tuz')).toEqual({ status: 'approved' });
    });

    it('still rejects profanity inside a recipe', () => {
      expect(recipeVerdict('siktir git').status).toBe('rejected');
    });
  });

  it('defaults to the general context when none is given', () => {
    expect(moderator.moderate({ text: 'fare zehri' })).toEqual({ status: 'approved' });
    expect(moderator.moderate({ text: 'sik' }).status).toBe('rejected');
  });
});
