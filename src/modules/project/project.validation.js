const { z } = require("zod")

const createProjectSchema = z.object({
  name: z.string().min(3),
  description: z.string().optional()
})

const updateProjectSchema = z.object({
  name: z.string().min(3).optional(),
  description: z.string().optional()
})

module.exports = {
  createProjectSchema,
  updateProjectSchema
}