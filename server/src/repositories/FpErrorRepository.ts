import { Op, fn, col, literal } from 'sequelize';
import { SqlFpError } from '../db/sql-models';
import { escapeLike, MAX_SEARCH_LENGTH } from '../utils/escapeLike';

export interface FpErrorGroupQuery {
  source?: string;
  kind?: string;
  q?: string;
  since?: Date;
  until?: Date;
  sort?: 'lastSeen' | 'firstSeen' | 'count';
  dir?: 'asc' | 'desc';
  limit: number;
  offset: number;
}

export const FpErrorRepository = {
  async listGroups(query: FpErrorGroupQuery) {
    const where: Record<string, unknown> = {};
    if (query.source) where.source = query.source;
    if (query.kind) where.kind = query.kind;
    if (query.q) where.message = { [Op.like]: `%${escapeLike(query.q.slice(0, MAX_SEARCH_LENGTH))}%` };
    if (query.since || query.until) {
      where.createdAt = { ...(query.since ? { [Op.gte]: query.since } : {}), ...(query.until ? { [Op.lte]: query.until } : {}) };
    }
    const dir = query.dir === 'asc' ? 'ASC' : 'DESC';
    const sortExpr = query.sort === 'count'
      ? literal('COUNT(id) + COALESCE(SUM(repeats), 0)')
      : fn(query.sort === 'firstSeen' ? 'MIN' : 'MAX', col('createdAt'));

    const rows = await SqlFpError.findAll({
      attributes: [
        'fingerprint',
        [fn('MAX', col('source')), 'source'],
        [fn('MAX', col('kind')), 'kind'],
        [fn('MAX', col('message')), 'message'],
        [fn('MAX', col('route')), 'route'],
        [literal('COUNT(id) + COALESCE(SUM(repeats), 0)'), 'count'],
        [fn('MIN', col('createdAt')), 'firstSeen'],
        [fn('MAX', col('createdAt')), 'lastSeen'],
      ],
      where,
      group: ['fingerprint'],
      // Order by the aggregate itself, not its alias: an unquoted alias is
      // folded to lower case on postgres and no longer matches "lastSeen".
      order: [[sortExpr, dir]],
      limit: query.limit,
      offset: query.offset,
      raw: true,
    });

    return rows.map((row: any) => ({ ...row, count: Number(row.count) }));
  },

  findOccurrences(fingerprint: string, limit = 50) {
    return SqlFpError.findAll({
      where: { fingerprint },
      order: [['createdAt', 'DESC']],
      limit,
    });
  },

  deleteFingerprint(fingerprint: string) {
    return SqlFpError.destroy({ where: { fingerprint } });
  },

  purgeOlderThan(days: number) {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    return SqlFpError.destroy({ where: { createdAt: { [Op.lt]: cutoff } } });
  },
};
