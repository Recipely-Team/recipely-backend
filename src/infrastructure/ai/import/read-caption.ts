/**
 * The text a post's author wrote about it, as yt-dlp reports it.
 *
 * @remarks
 * - **Facebook keeps a reel's caption in `title`**, not `description`: the
 *   share link `facebook.com/share/r/192Dg7W54U` probes as
 *   `title: "Buruşuk sütlaç tarifi"` with an empty description. Reading only
 *   `description` handed the model three frames of a pot and nothing else — no
 *   speech, no on-screen text — and it answered, reasonably, "no recipe".
 * - **Only Facebook, and only when the description is empty.** Instagram's
 *   `title` is a placeholder ("Video by guneycooks") and TikTok's is the
 *   description cut short, so falling back to it there adds noise or nothing.
 * - **A title that is just the page's name is not a caption.**
 * - **A Pinterest pin's title is its own field, usually the dish's name**
 *   ("The Best Juicy Chicken Breasts"), and the description is written apart
 *   from it, so both are read: title first, then the description.
 */
export const readCaption = (meta: Record<string, unknown>): string => {
  const description = typeof meta['description'] === 'string' ? meta['description'].trim() : '';
  const extractor = String(meta['extractor'] ?? '').toLowerCase();
  const title = typeof meta['title'] === 'string' ? meta['title'].trim() : '';

  if (extractor.includes('pinterest')) {
    return [title, description].filter((part, i, all) => part.length > 0 && all.indexOf(part) === i).join('\n\n');
  }
  if (description.length > 0) return description;
  if (!extractor.includes('facebook')) return '';

  const uploader = typeof meta['uploader'] === 'string' ? meta['uploader'].trim() : '';
  return title === uploader ? '' : title;
};
