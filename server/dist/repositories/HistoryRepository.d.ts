export interface IHistoryRecord {
    _id: string;
    id: string;
    userId: string;
    workspaceId: string;
    method: string;
    url: string;
    statusCode: number | null;
    duration: number | null;
    requestData: any;
    responseData: any;
    createdAt: Date;
}
export declare const HistoryRepository: {
    findByUser(userId: string, workspaceId: string, limit?: number): Promise<IHistoryRecord[]>;
    create(data: Omit<IHistoryRecord, "_id" | "id" | "createdAt">): Promise<IHistoryRecord>;
    delete(id: string): Promise<void>;
    deleteByUser(userId: string): Promise<void>;
};
//# sourceMappingURL=HistoryRepository.d.ts.map