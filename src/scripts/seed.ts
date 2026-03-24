/**
 * Database Seed Script
 * Populates database with demo data for testing multi-tenant system
 * 
 * Spec requirements:
 * - 2 tenants
 * - 3 users per tenant (1 Owner + 2 Members)
 * - Pre-existing audit log with valid chain (minimum 10 entries)
 * 
 * Run: npx ts-node src/scripts/seed.ts
 */

import prisma from '../config/prisma';
import argon2 from 'argon2';
import { generateApiKey, hashApiKey } from '../utils/crypto';
import { createAuditLog } from '../utils/audit.utils';
import logger from '../utils/logger';

// Demo data
const DEMO_TENANTS = [
  {
    name: 'Acme Corporation',
    slug: 'acme-corp',
  },
  {
    name: 'TechStart Inc',
    slug: 'techstart-inc',
  },
];

// 3 users per tenant: 1 Owner + 2 Members (spec requirement)
const DEMO_USERS_PER_TENANT = [
  {
    email: 'owner@example.com',
    name: 'Alice Owner',
    password: 'SecurePassword123!',
    role: 'owner',
  },
  {
    email: 'member1@example.com',
    name: 'Bob Member',
    password: 'SecurePassword456!',
    role: 'member',
  },
  {
    email: 'member2@example.com',
    name: 'Charlie Viewer',
    password: 'SecurePassword789!',
    role: 'member',
  },
];

const DEMO_WORKSPACES = [
  {
    name: 'Engineering',
    description: 'Engineering team workspace',
  },
  {
    name: 'Marketing',
    description: 'Marketing team workspace',
  },
];

const DEMO_PROJECTS = [
  {
    name: 'Website Redesign',
    description: 'Complete website UI/UX overhaul',
  },
  {
    name: 'API Migration',
    description: 'Migrate to new REST API architecture',
  },
];

const DEMO_TASKS = [
  { title: 'Design mockups', description: 'Create initial design mockups' },
  { title: 'Development', description: 'Implement features' },
  { title: 'Testing', description: 'QA and testing phase' },
  { title: 'Deployment', description: 'Deploy to production' },
];

async function seed() {
  logger.info('Starting database seed...');

  try {
    // Clear existing data (careful in production!)
    logger.info('Clearing existing data...');
    await prisma.task.deleteMany({});
    await prisma.projectMember.deleteMany({});
    await prisma.project.deleteMany({});
    await prisma.workspaceMember.deleteMany({});
    await prisma.workspace.deleteMany({});
    await prisma.emailDeliveryLog.deleteMany({});
    await prisma.rateLimitEvent.deleteMany({});
    await prisma.apiKey.deleteMany({});
    await prisma.auditLog.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.tenant.deleteMany({});

    // Create tenants
    logger.info('Creating tenants...');
    const tenants = [];
    for (const tenantData of DEMO_TENANTS) {
      const tenant = await prisma.tenant.create({ data: tenantData });
      tenants.push(tenant);
    }

    // Create users and API keys per tenant
    for (const tenant of tenants) {
      logger.info(`Creating users for tenant: ${tenant.name}`);

      // Create users with argon2 password hashing (async)
      const users = [];
      for (const userData of DEMO_USERS_PER_TENANT) {
        const passwordHash = await argon2.hash(userData.password, {
          type: argon2.argon2id,
          memoryCost: 2 ** 16,
          timeCost: 3,
          parallelism: 1,
        });

        const user = await prisma.user.create({
          data: {
            tenantId: tenant.id,
            email: userData.email,
            name: userData.name,
            passwordHash,
            role: userData.role,
            isEmailVerified: true,
          },
        });
        users.push(user);
        logger.info(`  Created user: ${user.email} (${user.role})`);
      }

      // Create API key for owner
      const owner = users.find((u) => u.role === 'owner');
      if (!owner) {
        throw new Error('Owner user not found during seeding');
      }
      const rawApiKey = generateApiKey();
      const hashedKey = await hashApiKey(rawApiKey);
      await prisma.apiKey.create({
        data: {
          tenantId: tenant.id,
          keyHash: hashedKey,
          createdBy: owner.id,
        },
      });
      logger.info(`  API Key: ${rawApiKey} (owner: ${owner.email})`);

      // === Build 10+ audit log entries per tenant (spec: minimum 10) ===
      // Entry 1: Tenant created
      await createAuditLog(prisma, {
        tenantId: tenant.id,
        userId: owner.id,
        action: 'TENANT_CREATED',
        resourceType: 'Tenant',
        resourceId: tenant.id,
        newValue: { name: tenant.name, slug: tenant.slug },
      });

      // Entries 2-4: Users created
      for (const user of users) {
        await createAuditLog(prisma, {
          tenantId: tenant.id,
          userId: owner.id,
          action: 'USER_CREATED',
          resourceType: 'User',
          resourceId: user.id,
          newValue: { email: user.email, name: user.name, role: user.role },
        });
      }

      // Entry 5: API key created
      await createAuditLog(prisma, {
        tenantId: tenant.id,
        userId: owner.id,
        action: 'API_KEY_CREATED',
        resourceType: 'ApiKey',
        newValue: { createdBy: owner.email },
      });

      // Create workspaces
      let auditCount = 5;
      for (const wsData of DEMO_WORKSPACES) {
        logger.info(`  Creating workspace: ${wsData.name}`);

        const workspace = await prisma.workspace.create({
          data: {
            tenantId: tenant.id,
            name: wsData.name,
            description: wsData.description,
            ownerId: owner.id,
          },
        });

        // Add workspace members
        for (const user of users) {
          await prisma.workspaceMember.create({
            data: {
              workspaceId: workspace.id,
              userId: user.id,
              role: user.id === owner.id ? 'owner' : 'member',
            },
          });
        }

        // Audit: workspace created
        auditCount++;
        await createAuditLog(prisma, {
          tenantId: tenant.id,
          userId: owner.id,
          action: 'WORKSPACE_CREATED',
          resourceType: 'Workspace',
          resourceId: workspace.id,
          newValue: { name: workspace.name },
        });

        // Create projects
        for (const projData of DEMO_PROJECTS) {
          logger.info(`    Creating project: ${projData.name}`);

          const project = await prisma.project.create({
            data: {
              tenantId: tenant.id,
              workspaceId: workspace.id,
              name: projData.name,
              description: projData.description,
              createdBy: owner.id,
            },
          });

          // Add owner as project member
          await prisma.projectMember.create({
            data: {
              projectId: project.id,
              userId: owner.id,
              role: 'owner',
            },
          });

          // Audit: project created
          auditCount++;
          await createAuditLog(prisma, {
            tenantId: tenant.id,
            userId: owner.id,
            action: 'PROJECT_CREATED',
            resourceType: 'Project',
            resourceId: project.id,
            newValue: { name: project.name, workspaceId: workspace.id },
          });

          // Create tasks
          for (const taskData of DEMO_TASKS) {
            const task = await prisma.task.create({
              data: {
                tenantId: tenant.id,
                projectId: project.id,
                title: taskData.title,
                description: taskData.description,
                status: 'todo',
                assignedToId: Math.random() > 0.5 ? users[0].id : undefined,
              },
            });

            // Audit: task created (adds more entries to meet 10+ requirement)
            auditCount++;
            if (auditCount <= 15) { // limit to avoid excessive entries
              await createAuditLog(prisma, {
                tenantId: tenant.id,
                userId: owner.id,
                action: 'TASK_CREATED',
                resourceType: 'Task',
                resourceId: task.id,
                newValue: { title: task.title, projectId: project.id },
              });
            }
          }
        }
      }

      logger.info(`  ✓ Created ${auditCount} audit log entries for ${tenant.name}`);
      
      // === Pre-populate rate limit scenarios (spec requirement) ===
      logger.info('  Creating rate limit scenarios...');
      await prisma.rateLimitEvent.create({
        data: {
          tenantId: tenant.id,
          limitType: 'BURST',
          endpoint: '/api/projects',
          ipAddress: '192.168.1.1',
          identifier: `key:${hashedKey}`,
          requestCount: 51,
          limit: 50,
          windowMs: 5000
        }
      });
      logger.info('  ✓ Created rate limit burst event');
    }

    logger.info('Database seeded successfully!');
    logger.info('Demo Credentials:');
    for (const tenant of DEMO_TENANTS) {
      logger.info(`  Tenant: ${tenant.name}`);
      for (const user of DEMO_USERS_PER_TENANT) {
        logger.info(`    Email: ${user.email}`);
        logger.info(`    Password: ${user.password}`);
      }
    }
  } catch (error) {
    logger.error('Seed error', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

seed();
