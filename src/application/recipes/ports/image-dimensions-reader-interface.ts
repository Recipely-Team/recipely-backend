/** An image's pixel size. */
export interface ImageDimensionsSnapshot {
  readonly width: number;
  readonly height: number;
}

/** Reads an image's pixel size without decoding or storing it. */
export interface ImageDimensionsReaderInterface {
  /** The size, or `null` when the bytes are not an image it can read. Never rejects. */
  read(bytes: Buffer): Promise<ImageDimensionsSnapshot | null>;
}
