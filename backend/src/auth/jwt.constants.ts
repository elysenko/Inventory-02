/**
 * Single source of truth for the signing secret. JwtModule and JwtStrategy must
 * agree; reading process.env in two places invites a silent mismatch where every
 * freshly issued token fails verification.
 */
export const JWT_SECRET: string = process.env.JWT_SECRET ?? 'stockroom-dev-secret-change-me';

/**
 * jsonwebtoken types this as a branded `StringValue` ("24h", "7d", ...) or a
 * number of seconds; a bare `string` is rejected at compile time, so the env
 * override is narrowed here once rather than cast at every call site.
 */
export const JWT_EXPIRES_IN = (process.env.JWT_EXPIRES_IN ??
  process.env.JWT_EXPIRATION ??
  process.env.JWT_EXP ??
  '24h') as `${number}${'s' | 'm' | 'h' | 'd'}`;
