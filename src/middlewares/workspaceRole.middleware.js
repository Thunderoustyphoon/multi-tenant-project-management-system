const WorkspaceMember = require("../models/workspaceRole.model")

const authorizeWorkspaceRole = (allowedRoles) => {

  return async (req, res, next) => {

    try {

      const workspaceId = req.params.workspaceId

      const membership = await WorkspaceMember.findOne({
        workspace: workspaceId,
        user: req.user.id
      })

      if (!membership) {
        return res.status(403).json({
          message: "Access denied: not a workspace member"
        })
      }

      if (!allowedRoles.includes(membership.role)) {
        return res.status(403).json({
          message: "Access denied: insufficient permissions"
        })
      }

      req.workspaceRole = membership.role

      next()

    } catch (err) {
      next(err)
    }

  }

}

module.exports = authorizeWorkspaceRole