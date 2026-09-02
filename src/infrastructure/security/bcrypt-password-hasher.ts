import bcrypt from 'bcryptjs';
import type { PasswordHasherInterface } from '@application/auth/ports/password-hasher-interface';

export class BcryptPasswordHasher implements PasswordHasherInterface {
  constructor(private readonly rounds: number) {}

  hash(plain: string): Promise<string> {
    return bcrypt.hash(plain, this.rounds);
  }

  verify(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }
}
