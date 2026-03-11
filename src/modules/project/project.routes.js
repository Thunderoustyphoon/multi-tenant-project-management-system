const express = require("express")
const router = express.Router()

const projectController = require("./project.controller")

const authMiddleware = require("../../middlewares/auth.middleware")
const authorizeWorkspaceRole = require("../../middlewares/workspaceRole.middleware")
const projectAccess = require("../../middlewares/projectAccess.middleware")

router.post(
    "/workspaces/:workspaceId/projects",
    authMiddleware,
    authorizeWorkspaceRole(["owner", "admin", "member"]),
    projectController.createProject
)

router.get(
    "/workspaces/:workspaceId/projects",
    authMiddleware,
    projectController.getWorkspaceProjects
)

router.get(
    "/projects/:projectId",
    authMiddleware, 
    projectAccess,
    projectController.getProjectById
)

router.patch(
    "/projects/:projectId",
    authMiddleware,
    projectAccess,
    projectController.updateProject
)

router.delete(
    "/projects/:projectId",
    authMiddleware, 
    projectAccess,
    projectController.deleteProject
)

module.exports = router