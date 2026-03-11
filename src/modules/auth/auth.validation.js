const { z } = require("zod")

const registerSchema = z.object({
  name:z.string(),
  email: z.string().email(),
  password: z.string().min(8)
}).strict()

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string()
}).strict()

module.exports = {
  registerSchema,
  loginSchema
}