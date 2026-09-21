export interface IRequestRecord {
    _id: string;
    id: string;
    collectionId: string;
    folderId: string | null;
    name: string;
    method: string;
    url: string;
    params: any[];
    headers: any[];
    auth: any;
    body: any;
    preRequestScript: string;
    testScript: string;
    description: string;
    order: number;
    comments: any[];
    createdBy: string;
    createdAt: Date;
    updatedAt: Date;
}
export declare const RequestRepository: {
    findById(id: string): Promise<IRequestRecord | null>;
    findByCollection(collectionId: string): Promise<IRequestRecord[]>;
    findByFolder(folderId: string): Promise<IRequestRecord[]>;
    create(data: Partial<IRequestRecord> & {
        name: string;
        collectionId: string;
        createdBy: string;
    }): Promise<IRequestRecord>;
    update(id: string, data: Partial<IRequestRecord>): Promise<IRequestRecord | null>;
    delete(id: string): Promise<void>;
    deleteByCollection(collectionId: string): Promise<void>;
    searchInWorkspace(query: string, collectionIds: string[]): Promise<IRequestRecord[]>;
};
//# sourceMappingURL=RequestRepository.d.ts.map