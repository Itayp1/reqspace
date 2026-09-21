import mongoose, { Document } from 'mongoose';
export interface ISharedLink extends Document {
    shortId: string;
    collectionId: mongoose.Types.ObjectId;
    workspaceId: mongoose.Types.ObjectId;
    createdBy: mongoose.Types.ObjectId;
    expiresAt: Date;
    createdAt: Date;
}
export declare const SharedLink: mongoose.Model<ISharedLink, {}, {}, {}, mongoose.Document<unknown, {}, ISharedLink, {}, {}> & ISharedLink & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
}, any>;
//# sourceMappingURL=SharedLink.d.ts.map