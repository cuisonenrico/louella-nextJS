import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import {
  AutofillOnDemandService,
  type AutofillScope,
} from '../../jobs/autofill-on-demand.service';
import { AUTOFILL_SCOPE_KEY } from '../decorators/autofill.decorator';

/**
 * Tops up today's placeholder rows before a sheet endpoint reads them.
 *
 * Registered globally (APP_INTERCEPTOR in AppModule) but inert unless a
 * handler carries `@Autofill(...)`, so it costs nothing on the other ~135
 * endpoints. It replaces the `@Cron` schedule and the `onModuleInit` backfill,
 * neither of which works without a long-lived process.
 *
 * The fill is awaited rather than fired off in the background: the handler
 * immediately reads the very rows it creates, and on serverless a floating
 * promise is not guaranteed to survive the response being sent.
 */
@Injectable()
export class AutofillInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly autofill: AutofillOnDemandService,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const scope = this.reflector.getAllAndOverride<AutofillScope | undefined>(
      AUTOFILL_SCOPE_KEY,
      [context.getHandler(), context.getClass()],
    );

    // ensure() swallows its own failures, so no try/catch is needed here — a
    // broken autofill must never stop the page from rendering.
    if (scope) await this.autofill.ensure(scope);

    return next.handle();
  }
}
