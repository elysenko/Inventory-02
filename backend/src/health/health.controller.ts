import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { Public } from '../auth/public.decorator';

interface LivenessResult {
  status: 'ok';
  service: 'stockroom-api';
  uptime: number;
}

interface ReadinessResult {
  status: 'ok' | 'degraded';
  database: 'up' | 'down';
  error?: string;
}

@ApiTags('health')
@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Liveness. Deliberately touches nothing external: a slow database must not
   * make Kubernetes kill an otherwise healthy pod.
   */
  @Get()
  check(): LivenessResult {
    return { status: 'ok', service: 'stockroom-api', uptime: Math.round(process.uptime()) };
  }

  /** Readiness — proves the process can actually reach Postgres. */
  @Get('deep')
  async deep(): Promise<ReadinessResult> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', database: 'up' };
    } catch (error) {
      return {
        status: 'degraded',
        database: 'down',
        error: error instanceof Error ? error.message : 'unknown error',
      };
    }
  }
}
