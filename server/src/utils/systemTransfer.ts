import crypto from 'crypto';
import zlib from 'zlib';
import { promisify } from 'util';
import { Model, ModelStatic, Transaction, fn, col } from 'sequelize';
import {
  SqlUser, SqlWorkspace, SqlCollection, SqlFolder, SqlRequest, SqlEnvironment, SqlGlobalEnvironment,
  SqlLocalVariable, SqlUserProfileVariable, SqlSharedLink, SqlCollectionFork, SqlForkItemHash, SqlHistory,
} from '../db/sql-models';
import { getSequelize } from '../db/sequelize';
import { SystemConfigRepository, sealSecret } from '../repositories/SystemConfigRepository';
import { open } from './cryptoBox';
import { superAdminCache, workspaceRoleCache } from './cache';

const scrypt = promisify(crypto.scrypt) as (pw: string, salt: Buffer, len: number, opts: crypto.ScryptOptions) => Promise<Buffer>;
const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

export const FORMAT = 'reqspace-system-export';
export const VERSION = 1;
const KDF = { N: 1 << 15, r: 8, p: 1, maxmem: 128 * 1024 * 1024 };

/** Insert order: parents before children. Deleting runs in reverse. */
const TABLES: Array<[string, ModelStatic<Model>]> = [
  ['users', SqlUser], ['workspaces', SqlWorkspace], ['collections', SqlCollection], ['folders', SqlFolder],
  ['requests', SqlRequest], ['environments', SqlEnvironment], ['globalEnvironments', SqlGlobalEnvironment],
  ['localVariables', SqlLocalVariable], ['userProfileVariables', SqlUserProfileVariable], ['sharedLinks', SqlSharedLink],
  ['collectionForks', SqlCollectionFork], ['forkItemHashes', SqlForkItemHash], ['history', SqlHistory],
];

/** Columns that hold a user id, per table, so a merge can point them at an existing account. */
const USER_REFS: Record<string, string[]> = {
  workspaces: ['ownerId'], collections: ['createdBy'], requests: ['createdBy', 'updatedBy'], environments: ['createdBy'],
  localVariables: ['userId'], userProfileVariables: ['userId'], sharedLinks: ['createdBy'], collectionForks: ['forkedByUserId'], history: ['userId'],
};

export interface SystemDump {
  meta: { createdAt: string; counts: Record<string, number>; includesHistory: boolean };
  tables: Record<string, any[]>;
  config?: any;
}

export class TransferError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

// ── Encryption envelope ───────────────────────────────────────────────────────
export async function encryptDump(dump: SystemDump, password: string): Promise<Buffer> {
  const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12);
  const key = await scrypt(password, salt, 32, KDF);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(await gzip(Buffer.from(JSON.stringify(dump), 'utf8'))), cipher.final()]);
  return Buffer.from(JSON.stringify({
    format: FORMAT, version: VERSION, kdf: 'scrypt', salt: salt.toString('base64'), iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64'),
  }));
}

export async function decryptDump(file: Buffer, password: string): Promise<SystemDump> {
  let env: any;
  try { env = JSON.parse(file.toString('utf8')); } catch { throw new TransferError('This is not a Reqspace system export file.'); }
  if (env?.format !== FORMAT) throw new TransferError('This is not a Reqspace system export file.');
  if (env.version !== VERSION) throw new TransferError(`Unsupported export version ${env.version} (this server reads version ${VERSION}).`);
  try {
    const key = await scrypt(password, Buffer.from(env.salt, 'base64'), 32, KDF);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(env.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(env.tag, 'base64'));
    const gz = Buffer.concat([decipher.update(Buffer.from(env.data, 'base64')), decipher.final()]);
    return JSON.parse((await gunzip(gz)).toString('utf8'));
  } catch {
    throw new TransferError('Wrong password, or the file is damaged.', 422); // not 401: the client treats that as a lost session
  }
}

// ── Secrets sealed with this server's CERT_ENCRYPTION_KEY ────────────────────
// They travel in plaintext inside the (encrypted) file and are sealed again with the target's key.
function mapCertSecrets(json: string | null, fn: (v: string) => string): string | null {
  if (!json) return json;
  let certs: any;
  try { certs = JSON.parse(json); } catch { return json; }
  if (!Array.isArray(certs)) return json;
  for (const c of certs) for (const f of ['key', 'passphrase']) if (c && typeof c[f] === 'string' && c[f]) c[f] = fn(c[f]);
  return JSON.stringify(certs);
}

// ── Export ────────────────────────────────────────────────────────────────────
export async function buildDump(opts: { includeHistory: boolean }): Promise<SystemDump> {
  const tables: Record<string, any[]> = {};
  for (const [name, model] of TABLES) {
    if (name === 'history' && !opts.includeHistory) { tables[name] = []; continue; }
    tables[name] = await model.findAll({ raw: true }) as any[];
  }
  try {
    for (const u of tables.users) u.clientCertificates = mapCertSecrets(u.clientCertificates, open);
  } catch {
    throw new TransferError('A stored client certificate could not be decrypted - CERT_ENCRYPTION_KEY does not match the data.', 409);
  }
  const config = await SystemConfigRepository.getConfig();
  const counts = Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, v.length]));
  return { meta: { createdAt: new Date().toISOString(), counts, includesHistory: opts.includeHistory }, tables, config: config ?? undefined };
}

// ── Import ────────────────────────────────────────────────────────────────────
function validate(dump: SystemDump) {
  if (!dump?.tables || typeof dump.tables !== 'object') throw new TransferError('The export file has no data.');
  for (const [name] of TABLES) {
    const rows = dump.tables[name];
    if (rows !== undefined && !Array.isArray(rows)) throw new TransferError(`The export file is damaged (${name}).`);
    for (const r of rows ?? []) if (!r || typeof r.id !== 'string') throw new TransferError(`The export file is damaged (a ${name} row has no id).`);
  }
  const users = dump.tables.users ?? [];
  if (!users.some((u: any) => u.isSuperAdmin && u.status === 'active')) {
    throw new TransferError('The file contains no active admin account, so nobody could sign in after importing it.');
  }
}

/** Orders folders so a parent is always inserted before its children. */
function foldersParentsFirst(rows: any[]): any[] {
  const byId = new Map(rows.map(r => [r.id, r]));
  const out: any[] = [], seen = new Set<string>();
  const visit = (r: any) => {
    if (seen.has(r.id)) return;
    seen.add(r.id);
    const parent = r.parentFolderId && byId.get(r.parentFolderId);
    if (parent) visit(parent);
    out.push(r);
  };
  rows.forEach(visit);
  return out;
}

function pick(model: ModelStatic<Model>, row: any) {
  const cols = Object.keys(model.getAttributes());
  return Object.fromEntries(cols.filter(c => c in row).map(c => [c, row[c]]));
}

const chunk = <T,>(a: T[], n = 500) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, (i + 1) * n));

export interface ImportResult { inserted: Record<string, number>; skipped: Record<string, number>; configApplied: boolean }

export async function previewImport(dump: SystemDump, mode: 'merge' | 'replace') {
  validate(dump);
  const counts = Object.fromEntries(TABLES.map(([n]) => [n, dump.tables[n]?.length ?? 0]));
  const existing = await SqlUser.findAll({ attributes: ['email'], raw: true }) as Array<{ email: string }>;
  const mine = new Set(existing.map(u => u.email.toLowerCase()));
  const emailConflicts = mode === 'merge' ? (dump.tables.users ?? []).filter((u: any) => mine.has(String(u.email).toLowerCase())).length : 0;
  return { createdAt: dump.meta?.createdAt, counts, includesHistory: !!dump.meta?.includesHistory, hasConfig: !!dump.config, emailConflicts };
}

export async function applyImport(dump: SystemDump, opts: { mode: 'merge' | 'replace'; applyConfig: boolean }): Promise<ImportResult> {
  validate(dump);
  const inserted: Record<string, number> = {}, skipped: Record<string, number> = {};
  const sq = getSequelize();
  const t: Transaction = await sq.transaction();
  try {
    let tables = Object.fromEntries(TABLES.map(([n]) => [n, [...(dump.tables[n] ?? [])]])) as Record<string, any[]>;

    // Certificates: plaintext in the file -> sealed with this server's key.
    for (const u of tables.users) u.clientCertificates = mapCertSecrets(u.clientCertificates, sealSecret);

    if (opts.mode === 'replace') {
      for (const [, model] of [...TABLES].reverse()) await model.destroy({ where: {}, transaction: t });
    } else {
      // Merge: accounts that already exist (same email) keep their id; everything that pointed at the
      // imported copy is pointed at the existing one.
      const existing = await SqlUser.findAll({ attributes: ['id', 'email'], raw: true, transaction: t }) as Array<{ id: string; email: string }>;
      const byEmail = new Map(existing.map(u => [u.email.toLowerCase(), u.id]));
      const remap = new Map<string, string>();
      for (const u of tables.users) { const id = byEmail.get(String(u.email).toLowerCase()); if (id) remap.set(u.id, id); }
      tables.users = tables.users.filter(u => !remap.has(u.id));
      skipped.users = remap.size;
      if (remap.size > 0) {
        // The same person's personal workspace already exists here; keep the imported one as a normal workspace.
        for (const w of tables.workspaces) if (remap.has(w.ownerId) && w.isPersonal) { w.isPersonal = false; w.name = `${w.name} (imported)`; }
        for (const [table, cols] of Object.entries(USER_REFS)) for (const r of tables[table]) for (const c of cols) if (remap.has(r[c])) r[c] = remap.get(r[c]);
        for (const w of tables.workspaces) {
          try {
            const members = JSON.parse(w.members);
            for (const m of members) if (remap.has(m.userId)) m.userId = remap.get(m.userId);
            w.members = JSON.stringify(members);
          } catch { /* leave as is */ }
        }
      }
    }
    tables.folders = foldersParentsFirst(tables.folders);

    for (const [name, model] of TABLES) {
      const rows = tables[name];
      let n = 0;
      for (const part of chunk(rows)) {
        const res = await model.bulkCreate(part.map(r => pick(model, r)) as any, { transaction: t, ignoreDuplicates: opts.mode === 'merge' });
        n += res.length;
      }
      inserted[name] = n;
      if (opts.mode === 'merge') skipped[name] = (skipped[name] ?? 0) + Math.max(0, rows.length - n);
    }
    await t.commit();
  } catch (err) {
    await t.rollback();
    if (err instanceof TransferError) throw err;
    throw new TransferError(`Import failed and nothing was changed: ${(err as Error).message}`, 400);
  }

  let configApplied = false;
  if (opts.applyConfig && dump.config) {
    const { id: _id, ...cfg } = dump.config;
    await SystemConfigRepository.updateConfig(cfg);
    configApplied = true;
  }
  // The counters came from the file (or the history was not included): make them match what is stored.
  const used = await SqlHistory.findAll({ attributes: ['userId', [fn('SUM', col('responseSizeBytes')), 'bytes']], group: ['userId'], raw: true }) as any[];
  const usedBy = new Map(used.map(r => [r.userId, Number(r.bytes) || 0]));
  for (const u of await SqlUser.findAll({ attributes: ['id', 'historyUsedBytes'], raw: true }) as any[]) {
    const bytes = usedBy.get(u.id) ?? 0;
    if (Number(u.historyUsedBytes) !== bytes) await SqlUser.update({ historyUsedBytes: bytes }, { where: { id: u.id } });
  }
  superAdminCache.clear();
  workspaceRoleCache.clear();
  return { inserted, skipped, configApplied };
}
