import type { PrivateReplyCard } from '@application/instagram/ports/private-reply-card';

/** Instagram caps generic-template titles and subtitles at 80 characters. */
const TEMPLATE_TEXT_MAX = 80;

const clip = (text: string): string => (text.length <= TEMPLATE_TEXT_MAX ? text : `${text.slice(0, TEMPLATE_TEXT_MAX - 1)}…`);

/**
 * A private reply's recipe card as an Instagram generic template: photo,
 * title, the creator's greeting, a tap-anywhere default action and one
 * "open recipe" button.
 */
export const cardMessage = (card: PrivateReplyCard): unknown => ({
  attachment: {
    type: 'template',
    payload: {
      template_type: 'generic',
      elements: [
        {
          title: clip(card.title),
          subtitle: clip(card.subtitle),
          ...(card.imageUrl !== null ? { image_url: card.imageUrl } : {}),
          default_action: { type: 'web_url', url: card.url },
          buttons: [{ type: 'web_url', url: card.url, title: card.buttonTitle }],
        },
      ],
    },
  },
});
