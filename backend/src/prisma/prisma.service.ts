import { INestApplication, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Connected to Postgres');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /**
   * Closes the Nest application on process signals so in-flight requests finish
   * and the connection pool is released instead of being severed.
   */
  enableShutdownHooks(app: INestApplication): void {
    process.once('SIGINT', () => void app.close());
    process.once('SIGTERM', () => void app.close());
  }
}
