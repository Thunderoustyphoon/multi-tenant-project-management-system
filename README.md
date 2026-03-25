# Multi-Tenant Project Management System (MTPMS)

Production-grade multi-tenant B2B SaaS backend API for project management. Built with TypeScript, Express, PostgreSQL, and featuring multi-level isolation, role-based access control, audit trails, and comprehensive rate limiting.

## 🧠 Explanation

**Hardest problem:** Designing the tamper-evident audit trail was the most challenging component. Each audit log entry contains a SHA-256 chain hash computed from the entry's content concatenated with the previous entry's hash, creating a blockchain-like linked structure. This required careful handling of deterministic serialization (JSON field ordering), concurrent write safety, and building a verification endpoint that recomputes the entire chain and pinpoints the exact entry where tampering occurred. A PostgreSQL trigger enforces append-only semantics by preventing UPDATE and DELETE operations on the audit table at the database level.

**Tenant isolation at query level:** Every database query includes a `tenantId` filter — not just at the middleware layer, but provably at the Prisma query level in every service method. The middleware extracts tenant context from the API key (hashed with Argon2id), and every subsequent query (projects, tasks, workspaces, audit logs) includes `where: { tenantId }`. This makes cross-tenant data leakage architecturally impossible, even if middleware is bypassed.

**Rate limiting** uses a sliding window algorithm backed by Redis sorted sets with `ZREMRANGEBYSCORE` pruning, avoiding the boundary-burst problem of fixed windows. Three tiers enforce global (1000/min per tenant), endpoint-specific (5–500/min), and burst (50/5sec per API key) limits.

**One thing I'd do differently:** I would implement row-level security (RLS) in PostgreSQL as a second layer of tenant isolation, so even raw SQL queries cannot accidentally leak data across tenants.

## 📋 Features

### Multi-Tenancy
- **Query-level isolation** via tenant_id foreign keys
- **API key authentication** with vz_* prefix format
- **Tenant-scoped operations** at every layer

### Authentication & Authorization
- **API Key-based authentication** (Bearer token)
- **2-role PBAC**: Owner and Member roles per tenant
- **Workspace/Project scoping** with inheritance
- **15-minute grace period** for key rotation

### Audit & Compliance
- **Tamper-evident audit logs** with SHA-256 chain hashing
- **Action tracking** for all operations (entity: CRUD, user: who, timestamp: when)
- **Audit verification** endpoint to detect tampering
- **Cursor pagination** for efficient log queries

### Rate Limiting (3-Tier)
- **Global (1000/min)**: All requests per tenant
- **Endpoint-specific (5-500/min)**: Per endpoint per tenant
- **Burst protection (50/5sec)**: Peak traffic handling
- **Redis-backed** with sliding window algorithm

### Email Processing
- **Async Bull queue** with exponential backoff
- **Retry strategy**: 1min, 5min, 30min
- **Dead letter queue** for failures
- **Delivery logging** with audit integration

### Modules
- **Authentication**: Register, API key generation/rotation, key revocation
- **Workspaces**: Tenant subdivisions with member management
- **Projects**: Within workspaces, member-scoped
- **Tasks**: Project-level with assignment tracking
- **Files**: Upload/download with metadata and access logging
- **Audit**: Verification and compliance export

## 🚀 Quick Start

### Prerequisites
- Node.js 20+
- PostgreSQL 14+
- Redis 7+
- Docker & Docker Compose (optional)

### Local Development

1. **Clone & Setup**
```bash
git clone <repo>
cd Multi-Tenant-Project-Management-System
npm install
```

2. **Environment Configuration**
```bash
cp .env.example .env

# Edit .env with your database and Redis URLs
DATABASE_URL="postgresql://user:password@localhost:5432/mtpms"
REDIS_URL="redis://localhost:6379"
JWT_SECRET="your-secret-key"
```

3. **Database Setup**
```bash
# Run migrations
npm run migrate:dev

# Seed demo data
npm run seed
```

4. **Start Development Server**
```bash
npm run dev
# Server runs on http://localhost:3000
```

5. **Health Check**
```bash
curl http://localhost:3000/api/health
```

6. **Browse API Documentation**

   Open [http://localhost:3000/docs](http://localhost:3000/docs) in your browser to launch the **Swagger UI** interactive explorer. From there you can:
   - Browse every endpoint grouped by tag (Auth, Workspaces, Projects, Tasks, Audit, Files)
   - Click **Authorize** 🔒 and enter your Bearer token (`vz_xxxx`) to test authenticated routes
   - Hit **Try it out** on any endpoint to send real requests and see live responses
   - Use the search/filter bar to quickly find endpoints

   > The raw OpenAPI spec is also available as JSON at [http://localhost:3000/api-docs.json](http://localhost:3000/api-docs.json) — useful for importing into Postman or generating client SDKs.

### Docker Setup

1. **Build & Run**
```bash
docker-compose up -d
```

2. **Initialize Database**
```bash
docker-compose exec app npm run migrate:prod
docker-compose exec app npm run seed
```

3. **View Logs**
```bash
docker-compose logs -f app
```

## 📖 API Documentation

### 🔗 Interactive API Explorer (Swagger UI)

| Resource | URL | Description |
|---|---|---|
| **Swagger UI** | [localhost:3000/docs](http://localhost:3000/docs) | Interactive docs — browse, authorize & test all endpoints |
| **OpenAPI JSON** | [localhost:3000/api-docs.json](http://localhost:3000/api-docs.json) | Raw spec — import into Postman, Insomnia, or code generators |
| **OpenAPI YAML** | [`openapi.yaml`](./openapi.yaml) | Source-of-truth spec file in the repo |

> **Tip:** Click the **Authorize** button in Swagger UI, paste your `vz_xxxx` API key, and you can test every endpoint directly from the browser — no curl or Postman needed.

### Authentication

**Register Tenant**
```bash
POST /api/auth/register
Content-Type: application/json

{
  "tenantName": "Acme Corp",
  "tenantSlug": "acme-corp",
  "email": "owner@acme.com",
  "name": "Alice Owner",
  "password": "SecurePassword123!"
}
```

**Generate API Key**
```bash
POST /api/auth/api-keys
Authorization: Bearer vz_...

{
  "name": "Production Key"
}
```

**Rotate API Key** (15-min grace period for old key)
```bash
POST /api/auth/api-keys/:keyId/rotate
Authorization: Bearer vz_...
```

**Revoke API Key**
```bash
DELETE /api/auth/api-keys/:keyId
Authorization: Bearer vz_...
```

### Workspaces

**Create Workspace**
```bash
POST /api/workspaces
Authorization: Bearer vz_...

{
  "name": "Engineering",
  "description": "Engineering team"
}
```

**List Workspaces**
```bash
GET /api/workspaces?limit=20&cursor=...
Authorization: Bearer vz_...
```

**Add Workspace Member**
```bash
POST /api/workspaces/:workspaceId/members
Authorization: Bearer vz_...

{
  "userId": "clk...",
  "role": "member"
}
```

### Projects

**Create Project**
```bash
POST /api/projects
Authorization: Bearer vz_...

{
  "workspaceId": "clk...",
  "name": "Website Redesign",
  "description": "UI/UX overhaul"
}
```

**List Projects**
```bash
GET /api/projects?workspaceId=clk...
Authorization: Bearer vz_...
```

### Tasks

**Create Task**
```bash
POST /api/projects/:projectId/tasks
Authorization: Bearer vz_...

{
  "title": "Design mockups",
  "description": "Create UI mockups",
  "status": "todo"
}
```

**Update Task**
```bash
PUT /api/projects/:projectId/tasks/:taskId
Authorization: Bearer vz_...

{
  "status": "in-progress"
}
```

**Assign Task**
```bash
POST /api/projects/:projectId/tasks/:taskId/assign
Authorization: Bearer vz_...

{
  "assignedToId": "clk..."
}
```

### Files

**Upload File**
```bash
POST /api/files
Authorization: Bearer vz_...
Content-Type: multipart/form-data

file=<binary>
```

**List Files**
```bash
GET /api/files?limit=20
Authorization: Bearer vz_...
```

**Download File**
```bash
GET /api/files/:fileId/download
Authorization: Bearer vz_...
```

### Audit

**Get Audit Logs**
```bash
GET /api/audit/logs?limit=50&cursor=...
Authorization: Bearer vz_...
```

**Verify Audit Chain** (tampering detection)
```bash
GET /api/audit/verify
Authorization: Bearer vz_...
```

**Export Audit Logs** (CSV format)
```bash
GET /api/audit/export?startDate=2024-01-01&endDate=2024-12-31
Authorization: Bearer vz_...
```

### Health & Metrics

**Health Check** (public - no auth required)
```bash
POST /health
```

**Get Metrics** (internal API key only)
```bash
GET /metrics
Authorization: Bearer vz_internal_key
```

**Get Tenant Status**
```bash
GET /api/status/:tenantId
Authorization: Bearer vz_...
```

## 🏗️ Architecture

### Directory Structure
```
src/
├── config/          # Database & Redis configuration
├── middlewares/     # Auth, error handling, rate limiting
├── modules/         # Feature modules (auth, workspace, project, task, file)
├── services/        # Business logic & external services
├── queues/          # Bull job processing (email)
├── utils/           # Shared utilities (crypto, audit, pagination)
├── routes/          # Route aggregation
├── types/           # TypeScript interfaces
└── server.ts        # Express app entry point

prisma/
├── schema.prisma    # Database schema
└── migrations/      # Database migrations
```

### Database Schema

**14 Models with relationships:**
- `Tenant` → `User` → `Workspace` → `Project` → `Task`
- `ApiKey` (multi-key per tenant with rotation support)
- `AuditLog` (append-only, tamper-evident)
- `WorkspaceMember` (binary roles: owner/member)
- `File` (upload metadata tracking)
- `EmailDeliveryLog` (queue tracking)
- `RateLimitEvent` (audit compliance)

### Rate Limiting Algorithm

**Sliding Window with 3 Tiers:**
1. **Global**: 1000 reqs/min per tenant
2. **Endpoint-specific**: 5-500 reqs/min per endpoint
3. **Burst**: 50 reqs/5sec protection

Redis sorted sets store request timestamps for efficient window calculation.

### Error Handling

**Spec-compliant response format:**
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input",
    "details": [
      {
        "field": "email",
        "issue": "Invalid email format"
      }
    ]
  }
}
```

**Error Types:**
- `ValidationError` (400)
- `UnauthorizedError` (401)
- `ForbiddenError` (403)
- `NotFoundError` (404)
- `ConflictError` (409)
- `TooManyRequestsError` (429)

## 📊 Development

### Scripts
```bash
# Development with hot reload
npm run dev

# Build TypeScript
npm run build

# Run production build
npm run start

# Run tests
npm test

# Run tests with coverage
npm test:coverage

# Lint code
npm run lint

# Format code
npm run format

# Database
npm run migrate:dev      # Create/apply migrations
npm run migrate:prod     # Apply migrations to production
npm run seed            # Seed demo data
npm run prisma:studio   # Open Prisma Studio

# Docker
docker-compose up       # Start all services
docker-compose down     # Stop all services
```

### Environment Variables
```env
# Server
NODE_ENV=development
PORT=3000

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/mtpms

# Cache & Queue
REDIS_URL=redis://localhost:6379

# Authentication
JWT_SECRET=your-secret-key-change-in-production
API_KEY_PREFIX=vz_

# Files
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=52428800  # 50MB

# Rate Limiting
RATE_LIMIT_WINDOW=60000         # 1 minute
RATE_LIMIT_MAX_REQUESTS=1000    # Global limit
```

### Testing

**Unit Tests**
```bash
npm test -- src/utils/
```

**Integration Tests**
```bash
npm test -- src/routes/
```

**Test Coverage**
```bash
npm test:coverage
```

**Example Test**
```typescript
import { TaskService } from '../src/modules/task/task.service';

describe('TaskService', () => {
  test('creates task in project', async () => {
    const task = await TaskService.createTask(
      tenantId,
      projectId,
      userId,
      { title: 'Test Task' }
    );
    expect(task.title).toBe('Test Task');
  });
});
```

## 🔐 Security

### API Key Format
- Prefix: `vz_`
- Length: 32 chars (crypto.randomBytes(24))
- Stored: SHA-256 hash in database
- Transmitted: Bearer token in Authorization header

### Password Hashing
- Algorithm: Argon2id (argon2 package)
- Time cost: 2
- Memory cost: 19 (512MB)

### CORS & Security Headers
- Helmet middleware for security headers
- CORS enabled for configured origins
- Rate limiting on all endpoints

### Database
- Query-level tenant isolation
- Foreign key constraints enforced
- Migrations for schema versioning

## 📈 Performance

### Optimization Strategies
- **Cursor pagination** for large datasets
- **Redis caching** for rate limit checks
- **Bull queues** for async processing
- **Connection pooling** via Prisma
- **Lazy loading** of relationships

### Monitoring
```bash
GET /api/metrics  # Prometheus-compatible metrics

{
  "uptime": 3600,
  "memory": { "rss": 102MB, "heapTotal": 50MB },
  "connections": { "db": 10, "redis": 1 },
  "queues": { "email": { "active": 2, "waiting": 15, "failed": 1 } }
}
```

## 🚢 Deployment

### Production Checklist
- [ ] Change JWT_SECRET to strong random value
- [ ] Use managed PostgreSQL (AWS RDS, etc.)
- [ ] Use managed Redis (AWS ElastiCache, etc.)
- [ ] Set NODE_ENV=production
- [ ] Configure CORS origins
- [ ] Set up SSL/TLS certificates
- [ ] Configure environment variables
- [ ] Run database migrations
- [ ] Set up monitoring & logging
- [ ] Configure backup strategy

### Docker Deployment
```bash
# Build image
docker build -t mtpms:latest .

# Run container
docker run -d \
  -e DATABASE_URL="postgresql://..." \
  -e REDIS_URL="redis://..." \
  -e JWT_SECRET="..." \
  -p 3000:3000 \
  mtpms:latest
```

## 📝 License

MIT License - see LICENSE file for details

## 🤝 Contributing

1. Create feature branch: `git checkout -b feature/amazing-feature`
2. Commit changes: `git commit -m 'Add amazing feature'`
3. Push to branch: `git push origin feature/amazing-feature`
4. Open Pull Request

## 📧 Support

- Interactive Docs: [Swagger UI](http://localhost:3000/docs) (run `npm run dev` first)
- OpenAPI Spec: [`openapi.yaml`](./openapi.yaml)
- Issues: [GitHub Issues](./issues)
- Email: support@example.com
