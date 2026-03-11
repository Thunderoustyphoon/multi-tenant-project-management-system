const projectService = require("./project.service")
const { createProjectSchema } = require("./project.validation")
const { updateProjectSchema } = require("./project.validation")

const createProject = async (req, res, next) => {

  try {

    const { workspaceId } = req.params

    const data = createProjectSchema.parse(req.body)

    const project = await projectService.createProject(
      workspaceId,
      req.user.id,
      data
    )

    res.status(201).json({
      message: "Project created",
      project
    })

  } catch (err) {
    next(err)
  }

}


const getWorkspaceProjects = async (req, res, next) => {

  try {

    const { workspaceId } = req.params

    const projects = await projectService.getWorkspaceProjects(workspaceId)

    res.json(projects)

  } catch (err) {
    next(err)
  }

}


const getProjectById = async (req, res, next) => {

  try {

    const { projectId } = req.params

    const project = await projectService.getProjectById(projectId)

    res.json(project)

  } catch (err) {
    next(err)
  }

}


const updateProject = async (req, res, next) => {

  try {

    const { projectId } = req.params

    const data = updateProjectSchema.parse(req.body)

    const project = await projectService.updateProject(projectId, data)

    res.json({
      message: "Project updated",
      project
    })

  } catch (err) {
    next(err)
  }

}

const deleteProject = async (req, res, next) => {

  try {

    const { projectId } = req.params

    await projectService.deleteProject(projectId)

    res.json({
      message: "Project deleted"
    })

  } catch (err) {
    next(err)
  }

}

module.exports = {
  createProject,
  getWorkspaceProjects,
  getProjectById,
  updateProject,
  deleteProject
}