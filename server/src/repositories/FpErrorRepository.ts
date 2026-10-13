import { Op, fn, col, literal } from 'sequelize';
import { SqlFpError } from '../db/sql-models';
import { escapeLike, MAX_SEARCH_LENGTH } from '../utils/escapeLike';

export interface FpErrorGroupQuery {
  source?: string;
  kind?: string;
  q?: string;
  limit: number;
  offset: number;
}

export const FpErrorRepository = {
  async listGroups(query: FpErrorGroupQuery) {
    const where: Record<string, unknown> = {};
    if (query.source) where.source = query.source;
    if (query.kind) where.kind = query.kind;
    if (query.q) where.message = { [Op.like]: `%${escapeLike(query.q.slice(0, MAX_SEARCH_LENGTH))}%` };

    const rows = await SqlFpError.findAll({
      attributes: [
        'fingerprint',
        [fn('MAX', col('source')), 'source'],
        [fn('MAX', col('kind')), 'kind'],
        [fn('MAX', col('message')), 'message'],
        [fn('MAX', col('route')), 'route'],
        [fn('COUNT', col('id')), 'count'],
        [fn('MIN', col('createdAt')), 'firstSeen'],
        [fn('MAX', col('createdAt')), 'lastSeen'],
      ],
      where,
      group: ['fingerprint'],
      order: [[literal('lastSeen'), 'DESC']],
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
