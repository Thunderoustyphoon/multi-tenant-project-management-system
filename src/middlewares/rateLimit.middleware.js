const rateLimit = require("express-rate-limit")

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: "Too many login attempts. Try again later."
})

const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 60,
  message: "Too many requests. Slow down."
})

module.exports = {
  authLimiter,
  apiLimiter
}