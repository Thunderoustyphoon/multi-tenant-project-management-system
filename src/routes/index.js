const express = require("express")
const router = express.Router()

const authRoutes = require("../modules/auth/auth.routes")
const workspaceRoutes = require("../modules/workspace/workspace.routes")
const projectRoutes = require("../modules/project/project.routes")

router.use("/auth", authRoutes)
router.use("/workspaces", workspaceRoutes)
router.use("/", projectRoutes)
// router.use("/workspaces", workspaceRoutes)

module.exports = router