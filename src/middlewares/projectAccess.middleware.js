const Project = require("../models/project.model")
const WorkspaceMember = require("../models/workspaceRole.model")

const projectAccess = async (req, res, next) => {

  try {

    const { projectId } = req.params

    const project = await Project.findById(projectId)

    if (!project) {
      return res.status(404).json({
        message: "Project not found"
      })
    }

    const membership = await WorkspaceMember.findOne({
      workspace: project.workspace,
      user: req.user.id
    })

    if (!membership) {
      return res.status(403).json({
        message: "Access denied"
      })
    }

    req.project = project
    req.workspaceRole = membership.role

    next()

  } catch (err) {
    next(err)
  }

}

module.exports = projectAccess