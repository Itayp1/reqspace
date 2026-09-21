import mongoose, { Document } from 'mongoose';
export interface IEnvironmentVariable {
    key: string;
    initialValue: string;
    currentValue: string;
    isSecret: boolean;
    enabled: boolean;
}
export interface IEnvironment extends Document {
    workspaceId: mongoose.Types.ObjectId;
    name: string;
    isGlobal: boolean;
    variables: IEnvironmentVariable[];
    createdBy: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}
export declare const Environment: mongoose.Model<IEnvironment, {}, {}, {}, mongoose.Document<unknown, {}, IEnvironment, {}, {}> & IEnvironment & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
}, any>;
//# sourceMappingURL=Environment.d.ts.map