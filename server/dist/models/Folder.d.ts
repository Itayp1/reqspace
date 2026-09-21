import mongoose, { Document } from 'mongoose';
export interface IFolder extends Document {
    collectionId: mongoose.Types.ObjectId;
    parentFolderId: mongoose.Types.ObjectId | null;
    name: string;
    description?: string;
    preRequestScript?: string;
    testScript?: string;
    order: number;
    createdAt: Date;
    updatedAt: Date;
}
export declare const Folder: mongoose.Model<IFolder, {}, {}, {}, mongoose.Document<unknown, {}, IFolder, {}, {}> & IFolder & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
}, any>;
//# sourceMappingURL=Folder.d.ts.map