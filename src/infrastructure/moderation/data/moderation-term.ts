export interface ModerationTerm {
  // Stored in already-normalized form (post word-list-content-moderator
  // normalization pipeline) since matching happens on normalized text.
  readonly term: string;
  // 'word' — must equal an entire token (the Scunthorpe defense for short,
  // ambiguous roots). 'substring' — matched anywhere in the glued compact
  // string; reserved for terms long/unique enough that they can't collide
  // with an innocent word.
  readonly matchType: 'word' | 'substring';
}
