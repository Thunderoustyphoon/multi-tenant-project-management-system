const express = require("express")
const workspaceController = require("./workspace.controller")
const authMiddleware = require("../../middlewares/auth.middleware")
const authorizeWorkspaceRole = require("../../middlewares/workspaceRole.middleware")
const router = express.Router()


router.post("/",authMiddleware,workspaceController.createWorkspace)
router.get("/",authMiddleware,workspaceController.getWorkspaces)

router.delete("/:workspaceId",authMiddleware,authorizeWorkspaceRole(["owner"]),workspaceController.deleteWorkspace)

router.get("/:workspaceId/members",authMiddleware, authorizeWorkspaceRole(["owner","admin","member","guest"]),workspaceController.getWorkspaceMembers)

router.post("/:workspaceId/members",authMiddleware, authorizeWorkspaceRole(["owner", "admin"]), workspaceController.inviteMember)

router.delete("/:workspaceId/members/:userId",authMiddleware, authorizeWorkspaceRole(["owner","admin"]), workspaceController.removeMember)

router.patch("/:workspaceId/members/:userId",authMiddleware, authorizeWorkspaceRole(["owner","admin"]), workspaceController.updateMemberRole)

router.get("/:workspaceId", authMiddleware,authorizeWorkspaceRole(["owner","admin","member","guest"]), workspaceController.getWorkspaceById)

router.patch("/:workspaceId",authMiddleware,authorizeWorkspaceRole(["owner","admin"]),
  workspaceController.updateWorkspace)

router.patch("/:workspaceId/transfer",authMiddleware,authorizeWorkspaceRole(["owner"]), workspaceController.transferOwnership)

module.exports = router