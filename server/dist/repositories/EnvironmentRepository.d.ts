export interface IEnvVariable {
    key: string;
    value: string;
    type?: string;
    enabled: boolean;
}
export interface IEnvironmentRecord {
    _id: string;
    id: string;
    workspaceId: string;
    name: string;
    variables: IEnvVariable[];
    createdBy: string;
    createdAt: Date;
    updatedAt: Date;
}
export interface IGlobalEnvRecord {
    _id: string;
    id: string;
    workspaceId: string;
    variables: IEnvVariable[];
    updatedAt: Date;
}
export declare const EnvironmentRepository: {
    findById(id: string): Promise<IEnvironmentRecord | null>;
    findByWorkspace(workspaceId: string): Promise<IEnvironmentRecord[]>;
    create(data: {
        workspaceId: string;
        name: string;
        variables?: IEnvVariable[];
        createdBy: string;
    }): Promise<IEnvironmentRecord>;
    update(id: string, data: Partial<IEnvironmentRecord>): Promise<IEnvironmentRecord | null>;
    delete(id: string): Promise<void>;
    findGlobal(workspaceId: string): Promise<IGlobalEnvRecord | null>;
    upsertGlobal(workspaceId: string, variables: IEnvVariable[]): Promise<IGlobalEnvRecord>;
};
//# sourceMappingURL=EnvironmentRepository.d.ts.map