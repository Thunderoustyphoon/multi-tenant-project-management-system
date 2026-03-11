const Project = require("../../models/project.model")

const createProject = async (workspaceId, userId, data) => {

  const project = await Project.create({
    name: data.name,
    description: data.description || "",
    workspace: workspaceId,
    createdBy: userId
  })

  return project
}

const getWorkspaceProjects = async (workspaceId) => {

  const projects = await Project.find({
    workspace: workspaceId
  }).sort({ createdAt: -1 })

  return projects

}


const getProjectById = async (projectId) => {

  const project = await Project
    .findById(projectId)
    .populate("createdBy", "email")

  if (!project) {
    throw new Error("Project not found")
  }

  return project
}


const updateProject = async (projectId, data) => {

  const project = await Project.findById(projectId)

  if (!project) {
    throw new Error("Project not found")
  }

  if (data.name !== undefined) {
    project.name = data.name
  }

  if (data.description !== undefined) {
    project.description = data.description
  }

  await project.save()

  return project
}


const deleteProject = async (projectId) => {

  const project = await Project.findById(projectId)

  if (!project) {
    throw new Error("Project not found")
  }

  await Project.deleteOne({ _id: projectId })

  return true
}

module.exports = {
  createProject,
  getWorkspaceProjects,
  getProjectById,
  updateProject,
  deleteProject
}