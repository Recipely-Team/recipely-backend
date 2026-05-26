export interface IAvatarUploader {
  /** Processes and stores the avatar, returning the public URL path. */
  upload(fileBuffer: Buffer, mimetype: string, userId: string): Promise<string>;
}
