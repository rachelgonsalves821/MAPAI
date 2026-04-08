// Set NODE_ENV to 'development' so that isDev=true in config.ts, which activates the
// dev-user fallback in authMiddleware for unauthenticated requests during tests.
// 'test' would make isDev=false and all protected routes would return 401.
process.env.NODE_ENV = 'development';
