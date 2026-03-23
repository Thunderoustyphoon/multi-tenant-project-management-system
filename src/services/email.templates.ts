/**
 * Structured Email Templates
 * Spec: "templates must be defined as structured objects with subject and body,
 * not hardcoded strings inside the send function."
 */

export interface EmailTemplate {
  subject: string | ((...args: any[]) => string);
  body: (...args: any[]) => string;
}

export const EMAIL_TEMPLATES: Record<string, EmailTemplate> = {
  WELCOME: {
    subject: (tenantName: string) => `Welcome to Multi-Tenant PM, ${tenantName}!`,
    body: (ownerName: string, tenantName: string) => `
      <h1>Welcome to Multi-Tenant Project Management!</h1>
      <p>Hi ${ownerName},</p>
      <p>Your tenant "${tenantName}" has been successfully created.</p>
      <p>You can now:</p>
      <ul>
        <li>Create and manage projects</li>
        <li>Invite team members</li>
        <li>Manage API keys for integrations</li>
      </ul>
      <p>Your initial API key has been generated and can be viewed in the dashboard.</p>
      <p>Best regards,<br>The Multi-Tenant PM Team</p>
    `,
  },

  USER_INVITED: {
    subject: (workspaceName: string) => `You've been invited to ${workspaceName}`,
    body: (userName: string, workspaceName: string) => `
      <h1>Workspace Invitation</h1>
      <p>Hi ${userName},</p>
      <p>You have been invited to join the "<strong>${workspaceName}</strong>" workspace.</p>
      <p>You can now:</p>
      <ul>
        <li>View and manage projects in this workspace</li>
        <li>Collaborate with team members</li>
        <li>Create and track tasks</li>
      </ul>
      <p>Log in to get started.</p>
      <p>Best regards,<br>The Multi-Tenant PM Team</p>
    `,
  },

  KEY_ROTATED: {
    subject: (keyName: string) => `API Key Rotated: ${keyName}`,
    body: (ownerName: string, keyName: string, gracePeriodMinutes: number) => `
      <h1>API Key Rotated</h1>
      <p>Hi ${ownerName},</p>
      <p>Your API key "${keyName}" has been rotated.</p>
      <p><strong>Grace Period:</strong> ${gracePeriodMinutes} minutes</p>
      <p>Your old API key will remain active for the grace period to allow for a smooth transition.</p>
      <p>Make sure to update your applications with the new API key.</p>
      <p>For security reasons:</p>
      <ul>
        <li>Update client applications immediately</li>
        <li>Old key will be deactivated after grace period</li>
        <li>Monitor audit logs for any unauthorized access</li>
      </ul>
      <p>Best regards,<br>The Multi-Tenant PM Team</p>
    `,
  },

  RATE_LIMIT_WARNING: {
    subject: 'Rate Limit Warning: 80% threshold reached',
    body: (currentCount: number, limit: number, percentage: number) => `
      <h1>Rate Limit Warning</h1>
      <p>Your tenant has reached <strong>${percentage}%</strong> of the global rate limit.</p>
      <p>Current usage: <strong>${currentCount}/${limit}</strong> requests per minute.</p>
      <p>Actions to consider:</p>
      <ul>
        <li>Review API usage patterns</li>
        <li>Implement client-side request batching</li>
        <li>Add caching to reduce repeated requests</li>
        <li>Contact support if you need a higher limit</li>
      </ul>
      <p>Best regards,<br>The Multi-Tenant PM Team</p>
    `,
  },

  PASSWORD_RESET: {
    subject: 'Password Reset Request',
    body: (userName: string, resetLink: string, expiresInMinutes: number) => `
      <h1>Password Reset Request</h1>
      <p>Hi ${userName},</p>
      <p>We received a request to reset your password. Click the link below to proceed:</p>
      <p><a href="${resetLink}">Reset Password</a></p>
      <p><strong>This link expires in ${expiresInMinutes} minutes.</strong></p>
      <p>If you didn't request this, you can safely ignore this email.</p>
      <p>For security reasons:</p>
      <ul>
        <li>Never share this link with anyone</li>
        <li>Use a strong password (min 8 chars, uppercase, number, special char)</li>
        <li>Change password for other accounts if you use the same password</li>
      </ul>
      <p>Best regards,<br>The Multi-Tenant PM Team</p>
    `,
  },

  AUDIT_SUMMARY: {
    subject: () => `Monthly Audit Summary - ${new Date().toLocaleDateString()}`,
    body: (ownerName: string, summary: {
      totalEvents: number;
      apiKeysRotated: number;
      usersAdded: number;
      projectsCreated: number;
      failedAuthAttempts: number;
      suspiciousActivities: number;
    }) => `
      <h1>Monthly Audit Summary</h1>
      <p>Hi ${ownerName},</p>
      <p>Here's your audit summary for the month:</p>
      <ul>
        <li><strong>Total Events:</strong> ${summary.totalEvents}</li>
        <li><strong>API Keys Rotated:</strong> ${summary.apiKeysRotated}</li>
        <li><strong>Users Added:</strong> ${summary.usersAdded}</li>
        <li><strong>Projects Created:</strong> ${summary.projectsCreated}</li>
        <li><strong>Failed Auth Attempts:</strong> ${summary.failedAuthAttempts}</li>
        <li><strong>Suspicious Activities:</strong> ${summary.suspiciousActivities}</li>
      </ul>
      <p>${
        summary.suspiciousActivities > 0
          ? '<strong style="color: red;">⚠ Review suspicious activities immediately</strong>'
          : '<span style="color: green;">✓ No suspicious activities detected</span>'
      }</p>
      <p>Log in to view detailed audit logs and take action if needed.</p>
      <p>Best regards,<br>The Multi-Tenant PM Team</p>
    `,
  },
};
