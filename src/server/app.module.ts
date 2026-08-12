import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { CacheModule } from '@nestjs/cache-manager';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { AutofillInterceptor } from './common/interceptors/autofill.interceptor';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { FilesModule } from './files/files.module';
import { JobsModule } from './jobs/jobs.module';
import { ProductsModule } from './products/products.module';
import { BranchesModule } from './branches/branches.module';
import { InventoryModule } from './inventory/inventory.module';
import { SalesModule } from './sales/sales.module';
import { MaterialsModule } from './materials/materials.module';
import { RecipesModule } from './recipes/recipes.module';
import { MaterialInventoryModule } from './material-inventory/material-inventory.module';
import { MaterialAdjustmentsModule } from './material-adjustments/material-adjustments.module';
import { UnitConversionsModule } from './unit-conversions/unit-conversions.module';
import { ProductionModule } from './production/production.module';
import { ProductionOrdersModule } from './production-orders/production-orders.module';
import { InventoryAdjustmentsModule } from './inventory-adjustments/inventory-adjustments.module';
import { InventoryImportModule } from './inventory-import/inventory-import.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PermissionsModule } from './permissions/permissions.module';
import { validateEnv } from './common/config/env.validation';
import { CacheNamespaceModule } from './common/cache/cache-namespace.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    CacheModule.register({ isGlobal: true, ttl: 45_000, max: 500 }),
    CacheNamespaceModule,
    // No ScheduleModule: serverless functions do not stay alive between
    // requests, so an in-process scheduler would never fire. The autofill jobs
    // it used to drive now run on demand — see AutofillInterceptor below.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 20 }]),
    PrismaModule,
    UsersModule,
    AuthModule,
    FilesModule,
    JobsModule,
    ProductsModule,
    BranchesModule,
    InventoryModule,
    SalesModule,
    MaterialsModule,
    RecipesModule,
    MaterialInventoryModule,
    MaterialAdjustmentsModule,
    UnitConversionsModule,
    ProductionModule,
    ProductionOrdersModule,
    InventoryAdjustmentsModule,
    InventoryImportModule,
    SuppliersModule,
    DashboardModule,
    NotificationsModule,
    PermissionsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Registered globally so any module can opt in with @Autofill() metadata
    // alone, without importing JobsModule (which would create a cycle through
    // MaterialInventoryModule). Inert on handlers that lack the decorator.
    { provide: APP_INTERCEPTOR, useClass: AutofillInterceptor },
  ],
})
export class AppModule {}
