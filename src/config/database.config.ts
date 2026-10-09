import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { config } from 'dotenv';

config();

export const getDatabaseConfig = (configService: ConfigService): TypeOrmModuleOptions => ({
  type: 'postgres',
  host: configService.get('DB_HOST', 'localhost'),
  port: configService.get('DB_PORT', 5432),
  username: configService.get('DB_USERNAME', 'postgres'),
  password: configService.get('DB_PASSWORD', 'password'),
  database: configService.get('DB_NAME', 'virtual_receptionist'),
  autoLoadEntities: true,
  synchronize: false, 
  logging: false,
  ssl: {
    rejectUnauthorized: false,
  },
  // Add migrations configuration
  migrations: ['dist/migrations/*.js'],
  entities: ['dist/schema/**/*.entity.js'],
  migrationsTableName: 'migrations',
});

// Export DataSource for TypeORM CLI (for migrations)
export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
  database: process.env.DB_NAME || 'virtual_receptionist',
  migrations: ['dist/migrations/*.js'],
  entities: ['dist/schema/**/*{.entity.js,.js}'],
  logging: true,
  ssl: {
    rejectUnauthorized: false,
  },
});