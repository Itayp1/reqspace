export interface IWorkspaceMemberRecord {
    userId: string;
    role: string;
    joinedAt: Date;
    invitedBy?: string;
}
export interface IWorkspaceRecord {
    _id: string;
    id: string;
    name: string;
    description: string;
    ownerId: string;
    members: IWorkspaceMemberRecord[];
    isPublic: boolean;
    createdAt: Date;
    updatedAt: Date;
    myRole?: string;
}
export declare const WorkspaceRepository: {
    findById(id: string): Promise<IWorkspaceRecord | null>;
    findForUser(userId: string): Promise<IWorkspaceRecord[]>;
    findPublic(): Promise<IWorkspaceRecord[]>;
    create(data: {
        name: string;
        description?: string;
        ownerId: string;
        isPublic?: boolean;
    }): Promise<IWorkspaceRecord>;
    update(id: string, data: Partial<{
        name: string;
        description: string;
        isPublic: boolean;
        members: IWorkspaceMemberRecord[];
    }>): Promise<IWorkspaceRecord | null>;
    delete(id: string): Promise<void>;
    list(): Promise<IWorkspaceRecord[]>;
};
//# sourceMappingURL=WorkspaceRepository.d.ts.map