import mongoose, { Document, Schema } from 'mongoose';

export type UserRole = 'viewer' | 'editor' | 'owner';
export type UserStatus = 'active' | 'suspended' | 'pending';
export type AuthType = 'password' | 'header' | 'sso';

export interface IClientCertificate {
  _id: mongoose.Types.ObjectId;
  hostname: string;
  cert: string;
  key: string;
  passphrase?: string;
  createdAt: Date;
}

export interface IUserSettings {
  followRedirects: boolean;
  verifySsl: boolean;
  sendNoCacheHeader: boolean;
  encodeUrl: boolean;
  timeout: number;
  proxyEnabled: boolean;
  proxyUrl: string;
  proxyAuthEnabled: boolean;
  proxyUsername?: string;
  proxyPassword?: string;
  saveHistory: boolean;
  shortcuts: {
    search: string;
    save: string;
    send: string;
  };
}

export interface IUser extends Document {
  name: string;
  email: string;
  passwordHash: string | null;
  authType: AuthType;
  isSuperAdmin: boolean;
  status: UserStatus;
  avatar?: string;
  settings: IUserSettings;
  clientCertificates: IClientCertificate[];
  historyUsedBytes: number;
  mustChangePassword?: boolean;
  createdAt: Date;
  lastLoginAt?: Date;
}

const ClientCertificateSchema = new Schema<IClientCertificate>({
  hostname: { type: String, required: true },
  cert: { type: String, required: true },
  key: { type: String, required: true },
  passphrase: { type: String },
  createdAt: { type: Date, default: Date.now },
});

const UserSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, default: null },
    authType: { type: String, enum: ['password', 'header', 'sso'], required: true },
    isSuperAdmin: { type: Boolean, default: false },
    status: { type: String, enum: ['active', 'suspended', 'pending'], default: 'active' },
    avatar: { type: String },
    settings: {
      followRedirects: { type: Boolean, default: true },
      verifySsl: { type: Boolean, default: true },
      sendNoCacheHeader: { type: Boolean, default: false },
      encodeUrl: { type: Boolean, default: true },
      timeout: { type: Number, default: 0 },
      proxyEnabled: { type: Boolean, default: false },
      proxyUrl: { type: String, default: 'http://127.0.0.1:8080' },
      proxyAuthEnabled: { type: Boolean, default: false },
      proxyUsername: { type: String, default: '' },
      proxyPassword: { type: String, default: '' },
      saveHistory: { type: Boolean, default: true },
      shortcuts: {
        search: { type: String, default: 'ctrl+k' },
        save: { type: String, default: 'ctrl+s' },
        send: { type: String, default: 'ctrl+enter' },
      }
    },
    clientCertificates: { type: [ClientCertificateSchema], default: [] },
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
