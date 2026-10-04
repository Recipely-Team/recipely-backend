import { cardMessage } from '@infrastructure/instagram/card-message';

describe('cardMessage', () => {
  it('builds a generic template with photo, clipped texts and an open button', () => {
    const message = cardMessage({ title: 'Fıstıklı Baklava', subtitle: 'x'.repeat(100), imageUrl: 'https://img/1.jpg', url: 'https://recipely.net/recipes/1', buttonTitle: 'Tarifi aç' }) as {
      attachment: { payload: { elements: Array<{ title: string; subtitle: string; image_url?: string; buttons: Array<{ url: string; title: string }> }> } };
    };
    const element = message.attachment.payload.elements[0]!;
    expect(element.title).toBe('Fıstıklı Baklava');
    expect(element.subtitle).toHaveLength(80);
    expect(element.image_url).toBe('https://img/1.jpg');
    expect(element.buttons[0]).toEqual({ type: 'web_url', url: 'https://recipely.net/recipes/1', title: 'Tarifi aç' });
  });

  it('leaves the photo out when the recipe has none', () => {
    const message = cardMessage({ title: 't', subtitle: 's', imageUrl: null, url: 'https://r', buttonTitle: 'b' }) as { attachment: { payload: { elements: Array<Record<string, unknown>> } } };
    expect(message.attachment.payload.elements[0]).not.toHaveProperty('image_url');
  });
});
