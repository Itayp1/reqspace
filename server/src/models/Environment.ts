import mongoose, { Document, Schema } from 'mongoose';

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
  order?: number;
  variables: IEnvironmentVariable[];
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const EnvironmentVariableSchema = new Schema<IEnvironmentVariable>(
  {
    key: { type: String, required: true },
    initialValue: { type: String, default: '' },
    currentValue: { type: String, default: '' },
    isSecret: { type: Boolean, default: false },
    enabled: { type: Boolean, default: true },
  },
  { _id: false }
);

const EnvironmentSchema = new Schema<IEnvironment>(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
    name: { type: String, required: true, trim: true },
    isGlobal: { type: Boolean, default: false },
    order: { type: Number, default: 0 },
    variables: { type: [EnvironmentVariableSchema], default: [] },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

EnvironmentSchema.index({ workspaceId: 1 });
EnvironmentSchema.index({ isGlobal: 1 });

export const Environment = mongoose.model<IEnvironment>('Environment', EnvironmentSchema);
