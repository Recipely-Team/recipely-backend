export interface UserDto {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly photoUrl: string | null;
  readonly role: string;
  readonly createdAt: string; // ISO
}

export interface AuthSessionDto {
  readonly token: string;
  readonly user: UserDto;
}
