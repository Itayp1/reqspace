import mongoose, { Document } from 'mongoose';
export interface ICollectionVariable {
    key: string;
    value: string;
    enabled: boolean;
}
export interface ICollection extends Document {
    workspaceId: mongoose.Types.ObjectId;
    name: string;
    description?: string;
    variables: ICollectionVariable[];
    preRequestScript?: string;
    testScript?: string;
    order: number;
    createdBy: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}
export declare const Collection: mongoose.Model<ICollection, {}, {}, {}, mongoose.Document<unknown, {}, ICollection, {}, {}> & ICollection & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
}, any>;
//# sourceMappingURL=Collection.d.ts.map