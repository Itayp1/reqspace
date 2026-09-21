import mongoose, { Document, Schema } from 'mongoose';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';
export type BodyMode = 'none' | 'raw' | 'form-data' | 'urlencoded' | 'binary';
export type RawLanguage = 'json' | 'text' | 'xml' | 'html' | 'javascript';
export type AuthType = 'none' | 'bearer' | 'basic' | 'apikey' | 'oauth2';

export interface IKeyValueItem {
  key: string;
  value: string;
  description?: string;
  enabled: boolean;
}

export interface IRequestAuth {
  type: AuthType;
  bearer?: { token: string };
  basic?: { username: string; password: string };
  apikey?: { key: string; value: string; in: 'header' | 'query' };
  oauth2?: { accessToken: string; tokenType: string };
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

const CommentSchema = new Schema<IComment>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const KeyValueSchema = new Schema<IKeyValueItem>(
  {
    key: { type: String, default: '' },
    value: { type: String, default: '' },
    description: { type: String, default: '' },
    enabled: { type: Boolean, default: true },
  },
  { _id: false }
);

const RequestSchema = new Schema<IRequest>(
  {
    collectionId: { type: Schema.Types.ObjectId, ref: 'Collection', required: true },
    folderId: { type: Schema.Types.ObjectId, ref: 'Folder', default: null },
    name: { type: String, required: true, trim: true },
    method: {
      type: String,
      enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'],
      default: 'GET',
    },
    url: { type: String, default: '' },
    params: { type: [KeyValueSchema], default: [] },
    headers: { type: [KeyValueSchema], default: [] },
    auth: {
      type: {
        type: String,
        enum: ['none', 'bearer', 'basic', 'apikey', 'oauth2'],
        default: 'none',
      },
      bearer: { token: String },
      basic: { username: String, password: String },
      apikey: { key: String, value: String, in: String },
      oauth2: { accessToken: String, tokenType: String },
    },
    body: {
      mode: {
        type: String,
        enum: ['none', 'raw', 'form-data', 'urlencoded', 'binary'],
        default: 'none',
      },
      raw: { type: String, default: '' },
      rawLanguage: {
        type: String,
        enum: ['json', 'text', 'xml', 'html', 'javascript'],
        default: 'json',
      },
      formData: { type: [KeyValueSchema], default: [] },
      urlencoded: { type: [KeyValueSchema], default: [] },
    },
    preRequestScript: { type: String, default: '' },
    testScript: { type: String, default: '' },
    description: { type: String, default: '' },
    order: { type: Number, default: 0 },
    comments: { type: [CommentSchema], default: [] },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

RequestSchema.index({ collectionId: 1 });
RequestSchema.index({ folderId: 1 });

export const Request = mongoose.model<IRequest>('Request', RequestSchema);
