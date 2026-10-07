/**
 * The bounds a comment-to-DM rule is held to, named once for the validators
 * and the entity. Instagram caps a message at 1000 characters; a public comment
 * reply at 2200, but a short one reads as a reply rather than an ad.
 */
export const DmRuleLimits = {
  KeywordsMax: 10,
  KeywordMaxLength: 40,
  DmTextMaxLength: 900,
  PublicReplyMaxLength: 300,
  /** How long after a comment Instagram still accepts a private reply to it. */
  PrivateReplyWindowDays: 7,
  /** How long a follower's comment text and username are kept on a send record. */
  CommenterDetailRetentionDays: 30,
} as const;
