// Unit tests model an explicit local development runtime, never an unknown deployment.
if (process.env.VERCEL_ENV === undefined && !process.env.VERCEL) process.env.VERCEL_ENV = 'development';
