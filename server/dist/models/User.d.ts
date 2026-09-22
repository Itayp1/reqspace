import mongoose, { Document } from 'mongoose';
export type UserRole = 'viewer' | 'editor' | 'owner';
export type UserStatus = 'active' | 'suspended' | 'pending';
export type AuthType = 'password' | 'header';
export interface IClientCertificate {
    _id: mongoose.Types.ObjectId;
    hostname: string;
    cert: string;
    key: string;
    passphrase?: string;
    createdAt: Date;
}
export interface IUserSettings {
    followRedirects: boolean;
    verifySsl: boolean;
    sendNoCacheHeader: boolean;
    encodeUrl: boolean;
    timeout: number;
    proxyEnabled: boolean;
    proxyUrl: string;
    proxyAuthEnabled: boolean;
    proxyUsername?: string;
    proxyPassword?: string;
    saveHistory: boolean;
    shortcuts: {
        search: string;
        save: string;
        send: string;
    };
}
export interface IUser extends Document {
    name: string;
    email: string;
    passwordHash: string | null;
    authType: AuthType;
    isSuperAdmin: boolean;
    status: UserStatus;
    avatar?: string;
    settings: IUserSettings;
    clientCertificates: IClientCertificate[];
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