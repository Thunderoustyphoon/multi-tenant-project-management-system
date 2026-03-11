const { z } = require("zod")

const createWorkspaceSchema = z.object({
  name: z.string().min(3, "Workspace name must be at least 3 characters")
})


const inviteMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(["admin","member","guest"]).optional()
})


const updateRoleSchema = z.object({
  role: z.enum(["admin","member","guest"])
})


const updateWorkspaceSchema = z.object({
  name: z.string().min(3, "Workspace name must be at least 3 characters")
})

const transferOwnershipSchema = z.object({
  newOwnerId: z.string()
})


module.exports = {
  createWorkspaceSchema,
  inviteMemberSchema,
  updateRoleSchema,
  updateWorkspaceSchema,
  transferOwnershipSchema
}
