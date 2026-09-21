import { IUser } from '../models/User';
export interface IUserRecord {
    _id: string;
    id: string;
    name: string;
    email: string;
    passwordHash: string | null;
    authType: string;
    isSuperAdmin: boolean;
    status: string;
    avatar?: string | null;
    preferences: any;
    historyUsedBytes: number;
    mustChangePassword?: boolean;
    lastLoginAt?: Date | null;
    createdAt: Date;
    updatedAt: Date;
}
export declare const UserRepository: {
    findById(id: string): Promise<IUserRecord | null>;
    findByEmail(email: string): Promise<IUserRecord | null>;
    create(data: {
        name: string;
        email: string;
        passwordHash?: string | null;
        authType?: string;
        isSuperAdmin?: boolean;
        status?: string;
        mustChangePassword?: boolean;
    }): Promise<IUserRecord>;
    update(id: string, data: Partial<IUserRecord & {
        passwordHash: string;
    }>): Promise<IUserRecord | null>;
    delete(id: string): Promise<void>;
    list(filter?: Record<string, any>): Promise<IUserRecord[]>;
    count(): Promise<number>;
    existsByEmail(email: string): Promise<boolean>;
    findRawMongoById(id: string): Promise<IUser | null>;
    findRawMongoByEmail(email: string): Promise<IUser | null>;
};
//# sourceMappingURL=UserRepository.d.ts.map