import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { UserRole } from '../models/User';
/** Get user's role in a workspace */
export declare function getUserWorkspaceRole(userId: string, workspaceId: string): Promise<UserRole | null>;
/**
 * Middleware factory: requires at least `minRole` in the workspace.
 * workspaceId is read from req.params.workspaceId or req.params.id
 */
export declare function requireWorkspaceRole(minRole: UserRole): (req: AuthRequest, res: Response, next: NextFunction) => Promise<void | Response<any, Record<string, any>>>;
export declare function canSave(role: UserRole): boolean;
export declare function canRun(role: UserRole): boolean;
export declare function canManageMembers(role: UserRole): boolean;
//# sourceMappingURL=rbac.d.ts.map