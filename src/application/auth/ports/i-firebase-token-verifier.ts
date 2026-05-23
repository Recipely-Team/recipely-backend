export interface FirebaseTokenPayload {
  readonly uid: string;
  readonly email: string | undefined;
  readonly name: string | undefined;
  readonly picture: string | undefined;
  readonly signInProvider: string;
}

export interface IFirebaseTokenVerifier {
  verify(idToken: string): Promise<FirebaseTokenPayload>;
}
