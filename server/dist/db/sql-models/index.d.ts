import { Model } from 'sequelize';
export declare class SqlUser extends Model {
    id: string;
    name: string;
    email: string;
    passwordHash: string | null;
    authType: string;
    isSuperAdmin: boolean;
    status: string;
    avatar: string | null;
    preferences: string;
    historyUsedBytes: number;
    mustChangePassword: boolean;
    lastLoginAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}
export declare class SqlWorkspace extends Model {
    id: string;
    name: string;
    description: string;
    ownerId: string;
    members: string;
    isPublic: boolean;
    createdAt: Date;
    updatedAt: Date;
}
export declare class SqlCollection extends Model {
    id: string;
    workspaceId: string;
    name: string;
    description: string;
    variables: string;
    preRequestScript: string;
    testScript: string;
    order: number;
    createdBy: string;
    createdAt: Date;
    updatedAt: Date;
}
export declare class SqlFolder extends Model {
    id: string;
    collectionId: string;
    parentFolderId: string | null;
    name: string;
    description: string;
    preRequestScript: string;
    testScript: string;
    order: number;
    createdAt: Date;
    updatedAt: Date;
}
export declare class SqlRequest extends Model {
    id: string;
    collectionId: string;
    folderId: string | null;
    name: string;
    method: string;
    url: string;
    params: string;
    headers: string;
    auth: string;
    body: string;
    preRequestScript: string;
    testScript: string;
    description: string;
    order: number;
    comments: string;
    createdBy: string;
    createdAt: Date;
    updatedAt: Date;
}
export declare class SqlEnvironment extends Model {
    id: string;
    workspaceId: string;
    name: string;
    variables: string;
    createdBy: string;
    createdAt: Date;
    updatedAt: Date;
}
export declare class SqlGlobalEnvironment extends Model {
    id: string;
    workspaceId: string;
    variables: string;
    updatedAt: Date;
}
export declare class SqlHistory extends Model {
    id: string;
    userId: string;
    workspaceId: string;
    method: string;
    url: string;
    statusCode: number | null;
    duration: number | null;
    requestData: string;
    responseData: string;
    createdAt: Date;
}
export declare class SqlAuditLog extends Model {
    id: string;
    userId: string;
    action: string;
    targetType: string | null;
    targetId: string | null;
    ip: string | null;
    details: string | null;
    createdAt: Date;
}
export declare class SqlSystemConfig extends Model {
    id: string;
    auth: string;
    history: string;
    proxy: string;
    updatedAt: Date;
}
export declare class SqlSharedLink extends Model {
    id: string;
    collectionId: string;
    token: string;
    createdBy: string;
    expiresAt: Date | null;
    createdAt: Date;
}
export declare function initSqlModels(): void;
//# sourceMappingURL=index.d.ts.map