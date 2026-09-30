import sharp from 'sharp';
import type {
  ImageDimensionsReaderInterface,
  ImageDimensionsSnapshot,
} from '@application/recipes/ports/image-dimensions-reader-interface';

/** Reads the size from the image header through sharp; unreadable bytes are `null`. */
export class SharpImageDimensionsReader implements ImageDimensionsReaderInterface {
  async read(bytes: Buffer): Promise<ImageDimensionsSnapshot | null> {
    try {
      const { width, height } = await sharp(bytes).metadata();
      return width !== undefined && height !== undefined ? { width, height } : null;
    } catch {
      return null;
    }
  }
}
