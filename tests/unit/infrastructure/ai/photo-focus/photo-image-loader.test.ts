import os from 'node:os';
import path from 'node:path';
import { mkdtemp, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { PhotoImageLoader, type FetchLike } from '@infrastructure/ai/photo-focus/photo-image-loader';

const BASE = 'https://api.example.com';

async function jpeg(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: '#c33' } }).jpeg().toBuffer();
}

describe('PhotoImageLoader', () => {
  it('reads our own upload from disk without a network call, and downsizes it', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'focus-'));
    await writeFile(path.join(dir, 'a.jpg'), await jpeg(2000, 1000));
    const fetchImpl = jest.fn() as unknown as FetchLike;

    const r = await new PhotoImageLoader(dir, BASE, fetchImpl).load(`${BASE}/uploads/a.jpg`);

    if (!r.ok) throw new Error('expected bytes');
    expect(fetchImpl).not.toHaveBeenCalled();
    const meta = await sharp(r.value.bytes).metadata();
    expect(meta.width).toBe(768);
    expect(r.value.mimeType).toBe('image/jpeg');
  });

  it('fetches a photo hosted elsewhere', async () => {
    const body = await jpeg(100, 100);
    const fetchImpl = jest.fn().mockResolvedValue(new Response(new Uint8Array(body), { status: 200 })) as unknown as FetchLike;
    const r = await new PhotoImageLoader('/nowhere', BASE, fetchImpl).load('https://cdn.example.org/p.jpg');
    expect(r.ok).toBe(true);
  });

  it('fails on a non-http URL, a 404 or bytes that are not an image', async () => {
    const notFound = jest.fn().mockResolvedValue(new Response('', { status: 404 })) as unknown as FetchLike;
    const garbage = jest.fn().mockResolvedValue(new Response('hello', { status: 200 })) as unknown as FetchLike;
    expect((await new PhotoImageLoader('/x', BASE, notFound).load('file:///etc/passwd')).ok).toBe(false);
    expect((await new PhotoImageLoader('/x', BASE, notFound).load('https://cdn.example.org/p.jpg')).ok).toBe(false);
    expect((await new PhotoImageLoader('/x', BASE, garbage).load('https://cdn.example.org/p.jpg')).ok).toBe(false);
  });
});
