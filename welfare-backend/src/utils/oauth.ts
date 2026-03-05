import crypto from 'node:crypto';

export interface OAuthStatePayload {
  state: string;
  codeVerifier: string;
  redirectPath: string;
  issuedAt: number;
}

function base64url(buffer: Buffer): string {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

export function randomBase64Url(byteLength = 32): string {
  return base64url(crypto.randomBytes(byteLength));
}

export function createCodeChallenge(verifier: string): string {
  return base64url(crypto.createHash('sha256').update(verifier).digest());
}

export function signOAuthState(
  payload: OAuthStatePayload,
  secret: string
): string {
  const body = base64url(Buffer.from(JSON.stringify(payload), 'utf8'));
  const signature = base64url(
    crypto.createHmac('sha256', secret).update(body).digest()
  );
  return `${body}.${signature}`;
}

export function verifyOAuthState(
  token: string,
  secret: string
): OAuthStatePayload | null {
  const [body, signature] = token.split('.');
  if (!body || !signature) return null;
  const expected = base64url(
    crypto.createHmac('sha256', secret).update(body).digest()
  );
  if (
    expected.length !== signature.length ||
    !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  ) {
    return null;
  }

  try {
    const decoded = JSON.parse(
      Buffer.from(
        body.replace(/-/g, '+').replace(/_/g, '/'),
        'base64'
      ).toString('utf8')
    ) as OAuthStatePayload;
    return decoded;
  } catch {
    return null;
  }
}

export function toSyntheticEmail(subject: string): string {
  return `linuxdo-${subject}@linuxdo-connect.invalid`;
}

export function isSafeLinuxDoSubject(subject: string): boolean {
  return /^[a-zA-Z0-9_-]{1,64}$/.test(subject);
}

