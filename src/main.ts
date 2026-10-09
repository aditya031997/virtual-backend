import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { json, urlencoded } from 'express';
import { AppModule } from '@/src/app.module';
import * as dotenv from 'dotenv';
import { startSitemapSyncCron } from '@/cron/sitemapSync';
import { startChatbotSessionExpiryCron } from '@/cron/chatbotSessionExpiry';

// Load environment variables
dotenv.config();

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Raise the request body size limit. ElevenLabs post-call webhooks carry the
  // full transcript + metadata and can exceed the default 100kb, which caused
  // PayloadTooLargeError and dropped the after-hours callback flow entirely.
  app.use(json({ limit: '10mb' }));
  app.use(urlencoded({ extended: true, limit: '10mb' }));

  // CORS configuration for both local and production environments
  const corsOrigins = [
    // Local development (Next.js may pick 3000/3001/3002 depending on what's free)
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:3002',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3001',
    'http://127.0.0.1:3002',
    // Production/Staging
    'https://stg.smartcaller.com.au',
    'http://stg.smartcaller.com.au',
    // On-site appliance served over the local network. No trailing slash and
    // no path — an Origin is scheme + host + port only, so anything else here
    // never matches what the browser sends. The port is part of the match:
    // ':3000' and bare (port 80) are two distinct origins, so both are listed.
    'http://192.168.1.90',
    'http://192.168.1.90:3000',
    'http://192.168.1.90:3001',
    'http://192.168.1.90:3002',
  ];

  if (process.env.FRONTEND_URL) {
    corsOrigins.push(process.env.FRONTEND_URL);
  }

  // Use the corsOrigins list built above (previously enableCors used a separate
  // hardcoded array, so the list and the FRONTEND_URL override were ignored).
  app.enableCors({
    origin: corsOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  // Enable validation pipe for DTOs
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }));

  app.setGlobalPrefix('api');
  await app.listen(process.env.PORT ?? 5000);
  console.log(`Server is running on port ${process.env.PORT ?? 5000}/api`);

  // Start sitemap sync cron job
  startSitemapSyncCron(app);

  // Start chatbot session inactivity-expiry cron job
  startChatbotSessionExpiryCron(app);
}

bootstrap();