export interface IFolderRecord {
    _id: string;
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
export declare const FolderRepository: {
    findById(id: string): Promise<IFolderRecord | null>;
    findByCollection(collectionId: string): Promise<IFolderRecord[]>;
    create(data: {
        collectionId: string;
        name: string;
        parentFolderId?: string | null;
        description?: string;
    }): Promise<IFolderRecord>;
    update(id: string, data: Partial<IFolderRecord>): Promise<IFolderRecord | null>;
    delete(id: string): Promise<void>;
    deleteByCollection(collectionId: string): Promise<void>;
};
//# sourceMappingURL=FolderRepository.d.ts.map