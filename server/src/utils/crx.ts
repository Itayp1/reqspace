import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const varint = (n: number): Buffer => {
  const out: number[] = [];
  while (n > 0x7f) { out.push((n & 0x7f) | 0x80); n = Math.floor(n / 128); }
  out.push(n);
  return Buffer.from(out);
};
// protobuf length-delimited field
const field = (num: number, data: Buffer): Buffer => Buffer.concat([varint((num << 3) | 2), varint(data.length), data]);

/** Loads the signing key (stable key = stable extension ID), generating it on first use. */
export function loadOrCreateKey(keyPath: string): crypto.KeyObject {
  if (fs.existsSync(keyPath)) return crypto.createPrivateKey(fs.readFileSync(keyPath));
  const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  fs.mkdirSync(path.dirname(keyPath), { recursive: true });
  fs.writeFileSync(keyPath, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  return privateKey;
}

/** Wraps a zip into a signed CRX3 file. */
export function zipToCrx(zip: Buffer, privateKey: crypto.KeyObject): Buffer {
  const pub = crypto.createPublicKey(privateKey).export({ type: 'spki', format: 'der' }) as Buffer;
  const crxId = crypto.createHash('sha256').update(pub).digest().subarray(0, 16);
  const signedData = field(1, crxId);
  const sizeLE = Buffer.alloc(4);
  sizeLE.writeUInt32LE(signedData.length);
  const signature = crypto.sign('sha256', Buffer.concat([Buffer.from('CRX3 SignedData\0'), sizeLE, signedData, zip]), privateKey);
  const header = Buffer.concat([
    field(2, Buffer.concat([field(1, pub), field(2, signature)])),
    field(10000, signedData),
  ]);
  const prefix = Buffer.alloc(12);
  prefix.write('Cr24', 0, 'latin1');
  prefix.writeUInt32LE(3, 4);
  prefix.writeUInt32LE(header.length, 8);
  return Buffer.concat([prefix, header, zip]);
}
