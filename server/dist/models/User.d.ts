import mongoose, { Document } from 'mongoose';
export type UserRole = 'viewer' | 'editor' | 'owner';
export type UserStatus = 'active' | 'suspended' | 'pending';
export type AuthType = 'password' | 'header';
export interface IUserPreferences {
    saveHistory: boolean;
    historyIncludeResponseBody: boolean;
    historyIncludeResponseHeaders: boolean;
    historyClearOlderThanDays: number;
}
export interface IUser extends Document {
    name: string;
    email: string;
    passwordHash: string | null;
    authType: AuthType;
    isSuperAdmin: boolean;
    status: UserStatus;
    avatar?: string;
    preferences: IUserPreferences;
    historyUsedBytes: number;
    mustChangePassword?: boolean;
    createdAt: Date;
    lastLoginAt?: Date;
}
export declare const User: mongoose.Model<IUser, {}, {}, {}, mongoose.Document<unknown, {}, IUser, {}, {}> & IUser & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
}, any>;
export declare function ensureDefaultAdmin(): Promise<void>;
//# sourceMappingURL=User.d.ts.map