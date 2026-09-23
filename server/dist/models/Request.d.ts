import mongoose, { Document } from 'mongoose';
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';
export type BodyMode = 'none' | 'raw' | 'form-data' | 'urlencoded' | 'binary';
export type RawLanguage = 'json' | 'text' | 'xml' | 'html' | 'javascript';
export type AuthType = 'none' | 'bearer' | 'basic' | 'apikey' | 'oauth2';
export interface IKeyValueItem {
    key: string;
    value: string;
    description?: string;
    enabled: boolean;
    type?: 'text' | 'file';
    fileName?: string;
    fileData?: string;
}
export interface IRequestAuth {
    type: AuthType;
    bearer?: {
        token: string;
    };
    basic?: {
        username: string;
        password: string;
    };
    apikey?: {
        key: string;
        value: string;
        in: 'header' | 'query';
    };
    oauth2?: {
        accessToken: string;
        tokenType: string;
    };
}
export interface IRequestBody {
    mode: BodyMode;
    raw?: string;
    rawLanguage?: RawLanguage;
    formData?: IKeyValueItem[];
    urlencoded?: IKeyValueItem[];
}
export interface IComment {
    userId: mongoose.Types.ObjectId;
    text: string;
    createdAt: Date;
}
export interface IRequest extends Document {
    collectionId: mongoose.Types.ObjectId;
    folderId: mongoose.Types.ObjectId | null;
    name: string;
    method: HttpMethod;
    url: string;
    params: IKeyValueItem[];
    headers: IKeyValueItem[];
    auth: IRequestAuth;
    body: IRequestBody;
    preRequestScript?: string;
    testScript?: string;
    description?: string;
    order: number;
    comments: IComment[];
    createdBy: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}
export declare const Request: mongoose.Model<IRequest, {}, {}, {}, mongoose.Document<unknown, {}, IRequest, {}, {}> & IRequest & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
}, any>;
//# sourceMappingURL=Request.d.ts.map