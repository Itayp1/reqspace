export interface ICollectionRecord {
    _id: string;
    id: string;
    workspaceId: string;
    name: string;
    description: string;
    variables: any[];
    preRequestScript: string;
    testScript: string;
    order: number;
    createdBy: string;
    createdAt: Date;
    updatedAt: Date;
}
export declare const CollectionRepository: {
    findById(id: string): Promise<ICollectionRecord | null>;
    findByWorkspace(workspaceId: string): Promise<ICollectionRecord[]>;
    create(data: {
        workspaceId: string;
        name: string;
        description?: string;
        createdBy: string;
    }): Promise<ICollectionRecord>;
    update(id: string, data: Partial<ICollectionRecord>): Promise<ICollectionRecord | null>;
    delete(id: string): Promise<void>;
    deleteByWorkspace(workspaceId: string): Promise<void>;
};
//# sourceMappingURL=CollectionRepository.d.ts.map