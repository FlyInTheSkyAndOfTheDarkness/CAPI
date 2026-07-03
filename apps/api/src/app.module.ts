import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { WorkspacesModule } from './workspaces/workspaces.module';
import { ConnectionsModule } from './connections/connections.module';
import { DestinationsModule } from './destinations/destinations.module';
import { MappingsModule } from './mappings/mappings.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { DeliveryModule } from './delivery/delivery.module';
import { LogsModule } from './logs/logs.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET', 'dev-secret'),
        signOptions: { expiresIn: '7d' },
      }),
    }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('REDIS_HOST', 'localhost'),
          port: Number(config.get<string>('REDIS_PORT', '6379')),
        },
      }),
    }),
    PrismaModule,
    AuthModule,
    WorkspacesModule,
    ConnectionsModule,
    DestinationsModule,
    MappingsModule,
    WebhooksModule,
    DeliveryModule,
    LogsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
