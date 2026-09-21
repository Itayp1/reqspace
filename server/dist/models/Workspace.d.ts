import mongoose, { Document } from 'mongoose';
import { UserRole } from './User';
export interface IWorkspaceMember {
    userId: mongoose.Types.ObjectId;
    role: UserRole;
    joinedAt: Date;
    invitedBy?: mongoose.Types.ObjectId;
}
export interface IWorkspace extends Document {
    name: string;
    description?: string;
    ownerId: mongoose.Types.ObjectId;
    members: IWorkspaceMember[];
    isPublic: boolean;
    createdAt: Date;
    updatedAt: Date;
}
export declare const Workspace: mongoose.Model<IWorkspace, {}, {}, {}, mongoose.Document<unknown, {}, IWorkspace, {}, {}> & IWorkspace & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
}, any>;
//# sourceMappingURL=Workspace.d.ts.map