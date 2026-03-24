import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' 
    ? ['query', 'error', 'warn'] 
    : ['error']
});

// Shutdown is handled centrally in server.ts (startServer)
// Removed duplicate SIGINT/SIGTERM handlers that would exit prematurely

export default prisma;
