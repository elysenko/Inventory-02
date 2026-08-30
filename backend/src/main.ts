import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { PrismaService } from './prisma/prisma.service';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'error', 'warn', 'debug'],
  });

  // Every route lives under /api — nginx proxies `location /api/` to this app.
  app.setGlobalPrefix('api');

  // Platform probes are configured for a bare /health, which the global prefix
  // would otherwise move to /api/health. Registering the alias on the underlying
  // adapter keeps both paths live, so a probe URL change can never take the pod
  // out of rotation.
  app.getHttpAdapter().get('/health', (_req: unknown, res: { json: (body: unknown) => void }) =>
    res.json({ status: 'ok', service: 'stockroom-api' }),
  );

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
      forbidNonWhitelisted: false,
    }),
  );

  // The SPA is served from a different origin (nginx) in every deployed
  // environment, so CORS must accept the configured frontend origin. When
  // FRONTEND_URL is unset we allow all origins: the API is token-authenticated
  // and cookie-free, so this cannot be abused for ambient-credential CSRF.
  const frontendUrl = process.env.FRONTEND_URL;
  app.enableCors({
    origin: frontendUrl ? frontendUrl.split(',').map((o) => o.trim()) : true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('StockRoom API')
    .setDescription('Inventory catalog, locations, stock movements and reports')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swaggerConfig));

  app.enableShutdownHooks();
  app.get(PrismaService).enableShutdownHooks(app);

  const port = parseInt(process.env.PORT ?? '3000', 10);
  await app.listen(port, '0.0.0.0');
  logger.log(`StockRoom API listening on http://0.0.0.0:${port}/api`);
}

void bootstrap();
