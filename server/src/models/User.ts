import mongoose, { Document, Schema } from 'mongoose';

export type UserRole = 'viewer' | 'editor' | 'owner';
export type UserStatus = 'active' | 'suspended' | 'pending';
export type AuthType = 'password' | 'header';

export interface IUserPreferences {
  saveHistory: boolean;
  historyIncludeResponseBody: boolean;
  historyIncludeResponseHeaders: boolean;
  historyClearOlderThanDays: number;
}

export interface IUser extends Document {
  name: string;
  email: string;
  passwordHash: string | null;
  authType: AuthType;
  isSuperAdmin: boolean;
  status: UserStatus;
  avatar?: string;
  preferences: IUserPreferences;
  historyUsedBytes: number;
  mustChangePassword?: boolean;
  createdAt: Date;
  lastLoginAt?: Date;
}

const UserSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, default: null },
    authType: { type: String, enum: ['password', 'header'], required: true },
    isSuperAdmin: { type: Boolean, default: false },
    status: { type: String, enum: ['active', 'suspended', 'pending'], default: 'active' },
    avatar: { type: String },
    preferences: {
      saveHistory: { type: Boolean, default: true },
      historyIncludeResponseBody: { type: Boolean, default: true },
      historyIncludeResponseHeaders: { type: Boolean, default: false },
      historyClearOlderThanDays: { type: Number, default: 30 },
    },
    historyUsedBytes: { type: Number, default: 0 },
    mustChangePassword: { type: Boolean, default: false },
    lastLoginAt: { type: Date },
  },
  { timestamps: true }
);

UserSchema.index({ email: 1 });
UserSchema.index({ isSuperAdmin: 1 });

export const User = mongoose.model<IUser>('User', UserSchema);

export async function ensureDefaultAdmin() {
  const adminCount = await User.countDocuments({ isSuperAdmin: true });
  if (adminCount === 0) {
    const bcrypt = await import('bcryptjs');
    const passwordHash = await bcrypt.hash('admin', 10);
    const adminUser = await User.create({
      name: 'Admin',
      email: 'admin', // The user requested 'admin' as username, but our schema uses 'email' field and validates lowercase etc. Let's just use 'admin'. Wait, we will need to bypass email validation if it expects '@' ? It just says lowercase and trim. We'll use 'admin'
      passwordHash,
      authType: 'password',
      isSuperAdmin: true,
      mustChangePassword: true
    });

    // Create a personal workspace for the admin
    const { Workspace } = await import('./Workspace');
    await Workspace.create({
      name: `Admin's Workspace`,
      description: 'Personal workspace',
      ownerId: adminUser._id,
      members: [{ userId: adminUser._id, role: 'owner', joinedAt: new Date() }],
    });
    
    console.log('✅ Default superadmin created (admin / admin) - password change required');
  }
}
