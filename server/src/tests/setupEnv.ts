// Every suite signs tokens with the secret the server reads; this value is for tests only.
process.env.JWT_SECRET ??= 'jest-only-jwt-secret-0123456789abcdef0123456789abcdef';
