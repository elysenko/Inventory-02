import { HttpException, HttpStatus } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

export const PLACEHOLDER = 'PLACEHOLDER_CONFIGURE_IN_SETTINGS';

/**
 * Raised when a feature needs a credential that has not been configured.
 * 503 (not 500): the request is well-formed, the capability is simply absent —
 * and a missing third-party key must degrade one feature, never crash the pod.
 */
export class ServiceUnconfiguredError extends HttpException {
  constructor(key: string) {
    super(
      {
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        error: 'Service Unconfigured',
        message: `${key} is not configured. An administrator can set it in Admin → Settings.`,
        key,
      },
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}

let client: PrismaClient | null = null;
function db(): PrismaClient {
  client ??= new PrismaClient();
  return client;
}

/**
 * Resolves a config value with this priority:
 *   1. Environment variable (mounted from the platform secret at deploy time)
 *   2. SystemSetting DB row (set through the admin settings panel)
 *   3. null — the feature is unconfigured; callers should raise
 *      ServiceUnconfiguredError rather than proceeding with a broken client.
 */
export async function resolveConfig(key: string, prisma?: PrismaClient): Promise<string | null> {
  const fromEnv = process.env[key];
  if (fromEnv && fromEnv !== PLACEHOLDER) return fromEnv;

  try {
    const row = await (prisma ?? db()).systemSetting.findUnique({ where: { key } });
    if (row?.value && row.value !== PLACEHOLDER) return row.value;
  } catch {
    // A settings-table read failure must not take down the caller; treat it as
    // "unconfigured" and let the feature degrade.
    return null;
  }
  return null;
}

/** True when the key resolves to a usable value. */
export async function isConfigured(key: string, prisma?: PrismaClient): Promise<boolean> {
  return (await resolveConfig(key, prisma)) !== null;
}

export async function requireConfig(key: string, prisma?: PrismaClient): Promise<string> {
  const value = await resolveConfig(key, prisma);
  if (value === null) throw new ServiceUnconfiguredError(key);
  return value;
}
