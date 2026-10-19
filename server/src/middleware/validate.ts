import { Request, Response, NextFunction, RequestHandler } from 'express';
import { ZodTypeAny } from 'zod';
import { noteRouteError } from '../utils/errorReporter';

export function validate(schema: ZodTypeAny): RequestHandler {
  return function validateMiddleware(req: Request, res: Response, next: NextFunction) {
    try {
      // only strict() if it's an object schema, else just parse
      const isObject = schema.constructor.name === 'ZodObject';
      // An explicit .passthrough() schema is respected; everything else is forced strict.
      const passthrough = isObject && (schema as any)._def?.unknownKeys === 'passthrough';
      const parsed = isObject && !passthrough ? (schema as any).strict().safeParse(req.body) : schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ 
          message: 'Invalid request body', 
          issues: parsed.error.issues 
        });
      }
      req.body = parsed.data;
      next();
    } catch (err: any) {
      noteRouteError(res, err);
      return res.status(500).json({ message: 'Validation error', error: err.message });
    }
  };
}
