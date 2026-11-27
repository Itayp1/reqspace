// Tests lower this (BCRYPT_ROUNDS=1; bcryptjs clamps to its minimum of 4) because the pure-JS hash blocks the event loop.
export const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS) || 12;
