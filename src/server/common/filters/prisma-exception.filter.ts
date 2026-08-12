import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';

    switch (exception.code) {
      // Unique constraint violation
      case 'P2002': {
        const raw = exception.meta?.target;
        const fields = Array.isArray(raw)
          ? raw.join(', ')
          : typeof raw === 'string'
            ? raw.replace(/_/g, ', ')
            : 'field';
        status = HttpStatus.CONFLICT;
        message = `A record with this ${fields} already exists.`;
        break;
      }
      // Record not found (update/delete on non-existent row)
      case 'P2025':
        status = HttpStatus.NOT_FOUND;
        message = 'Record not found.';
        break;
      // Foreign key constraint failed
      case 'P2003':
        status = HttpStatus.BAD_REQUEST;
        message = 'Related record does not exist.';
        break;
      // Required field missing
      case 'P2011':
        status = HttpStatus.BAD_REQUEST;
        message = 'A required field is missing.';
        break;
      default:
        this.logger.error(
          `Unhandled Prisma error ${exception.code}`,
          exception.message,
        );
    }

    response.status(status).json({
      statusCode: status,
      message,
      error: HttpStatus[status],
    });
  }
}
