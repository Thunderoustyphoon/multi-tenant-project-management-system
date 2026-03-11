const { ZodError } = require("zod")

const errorHandler = (err, req, res, next) => {

  // Zod validation errors
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: err.issues[0].message
    })
  }

  // Custom thrown errors
  if (err.message) {
    return res.status(400).json({
      error: err.message
    })
  }

  // Unknown errors
  return res.status(500).json({
    error: "Internal Server Error"
  })
}

module.exports = errorHandler