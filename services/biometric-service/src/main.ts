import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

const PORT = process.env.BIOMETRIC_SERVICE_PORT ?? 3012;

async function bootstrap(): Promise<void> {
  const logger = new Logger('biometric-service');

  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Préfixe global API ; /health exclu pour matcher la sonde Docker/K3s (curl /health)
  app.setGlobalPrefix('api/v1', { exclude: ['health'] });
  app.enableCors({
    origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
  });

  const config = new DocumentBuilder()
    .setTitle('NINA-AES Biometric Service')
    .setDescription('Service biométrique — extension des parcours NINA-AES')
    .setVersion('0.1')
    .addBearerAuth()
    .addTag('health', 'Santé du service')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(PORT);
  logger.log(`biometric-service listening on port ${PORT}`);
}

bootstrap();
