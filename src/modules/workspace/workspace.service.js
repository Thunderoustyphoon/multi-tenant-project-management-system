const Workspace = require("../../models/workspace.model")
const WorkspaceMember = require("../../models/workspaceRole.model")
const User = require("../../models/user.model")


const createWorkspace = async (userId, data) => {

  const workspace = await Workspace.create({
    name: data.name,
    owner: userId
  })

  await WorkspaceMember.create({
    user: userId,
    workspace: workspace._id,
    role: "owner"
  })

  return workspace
}



const getUserWorkspaces = async (userId) => {

  const memberships = await WorkspaceMember
    .find({ user: userId })
    .populate("workspace")

  return memberships.map(m => m.workspace)

}


const deleteWorkspace = async (workspaceId) => {

  const workspace = await Workspace.findById(workspaceId)

  if (!workspace) {
    throw new Error("Workspace not found")
  }

  await Workspace.deleteOne({ _id: workspaceId })

  await WorkspaceMember.deleteMany({ workspace: workspaceId })

}


const getWorkspaceMembers = async (workspaceId) => {

  const members = await WorkspaceMember
    .find({ workspace: workspaceId })
    .populate("user", "email")

  return members

}



const inviteMember = async (workspaceId, data) => {

  const { email, role = "member" } = data

  const user = await User.findOne({ email })

  if (!user) {
    throw new Error("User not found")
  }

  const existingMembership = await WorkspaceMember.findOne({
    workspace: workspaceId,
    user: user._id
  })

  if (existingMembership) {
    throw new Error("User already in workspace")
  }

  const membership = await WorkspaceMember.create({
    workspace: workspaceId,
    user: user._id,
    role
  })

  return membership

}


const removeMember = async (workspaceId, userId, currentUserId) => {

  if (userId === currentUserId) {
    throw new Error("You cannot remove yourself from the workspace")
  }

  const membership = await WorkspaceMember.findOne({
    workspace: workspaceId,
    user: userId
  })

  if (!membership) {
    throw new Error("Member not found")
  }

  if (membership.role === "owner") {
    throw new Error("Owner cannot be removed")
  }

  await WorkspaceMember.deleteOne({
    workspace: workspaceId,
    user: userId
  })

}


const updateMemberRole = async (workspaceId, userId, role) => {

  const membership = await WorkspaceMember.findOne({
    workspace: workspaceId,
    user: userId
  })

  if (!membership) {
    throw new Error("Member not found")
  }

  if (membership.role === "owner") {
    throw new Error("Owner role cannot be modified")
  }

  membership.role = role

  await membership.save()

  return membership

}


const getWorkspaceById = async (workspaceId) => {

  const workspace = await Workspace.findById(workspaceId)

  if (!workspace) {
    throw new Error("Workspace not found")
  }

  return workspace

}


const updateWorkspace = async (workspaceId, data) => {

  const workspace = await Workspace.findById(workspaceId)

  if (!workspace) {
    throw new Error("Workspace not found")
  }

  workspace.name = data.name

  await workspace.save()

  return workspace

}


const transferOwnership = async (workspaceId, currentOwnerId, newOwnerId) => {

  const workspace = await Workspace.findById(workspaceId)

  if (!workspace) {
    throw new Error("Workspace not found")
  }

  if (workspace.owner.toString() !== currentOwnerId) {
    throw new Error("Only the owner can transfer ownership")
  }

  const newOwnerMembership = await WorkspaceMember.findOne({
    workspace: workspaceId,
    user: newOwnerId
  })

  if (!newOwnerMembership) {
    throw new Error("New owner must be a workspace member")
  }

  const currentOwnerMembership = await WorkspaceMember.findOne({
    workspace: workspaceId,
    user: currentOwnerId
  })

  currentOwnerMembership.role = "admin"
  newOwnerMembership.role = "owner"

  await currentOwnerMembership.save()
  await newOwnerMembership.save()

  workspace.owner = newOwnerId

  await workspace.save()

  return workspace
}

module.exports = {
  createWorkspace,
  getUserWorkspaces,
  deleteWorkspace,
  getWorkspaceMembers,
  inviteMember,
  removeMember,
  updateMemberRole,
  getWorkspaceById,
  updateWorkspace,
  transferOwnership
}