import { Request, Response, NextFunction } from 'express';
export interface AuthRequest extends Request {
    user?: any;
}
export declare function signToken(userId: string, ttlDays: number): string;
export declare function setCookieToken(res: Response, token: string, ttlDays: number): void;
/** Creates personal workspace for a new user */
export declare function createPersonalWorkspace(user: any): Promise<void>;
/** Main auth middleware – validates JWT from cookie and optionally handles header auth */
export declare function authenticate(req: AuthRequest, res: Response, next: NextFunction): Promise<void | Response<any, Record<string, any>>>;
/** Require SuperAdmin */
export declare function requireSuperAdmin(req: AuthRequest, res: Response, next: NextFunction): Response<any, Record<string, any>> | undefined;
//# sourceMappingURL=auth.d.ts.map