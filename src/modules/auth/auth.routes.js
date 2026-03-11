const express = require("express")
const authController = require("./auth.controller")
const router = express.Router()
const { authLimiter } = require("../../middlewares/rateLimit.middleware")

router.post("/register", authLimiter, authController.register)
router.post("/login", authLimiter, authController.login)
router.post("/refresh", authLimiter, authController.refreshToken)
router.post("/logout", authController.logout)

module.exports = router