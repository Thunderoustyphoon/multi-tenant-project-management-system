const workspaceService = require("./workspace.service")
// const Workspace = require("../../models/workspace.model")
const { createWorkspaceSchema } = require("./workspace.validation")
const {inviteMemberSchema} = require("./workspace.validation")
const {updateRoleSchema} = require("./workspace.validation")
const {updateWorkspaceSchema} = require("./workspace.validation")
const {transferOwnershipSchema} = require("./workspace.validation")

const createWorkspace = async (req, res, next) => {

    try {

        const data = createWorkspaceSchema.parse(req.body)

        const workspace = await workspaceService.createWorkspace(
            req.user.id,
            data
        )

        res.status(201).json({
            message: "Workspace created",
            workspace
        })

    } catch (err) {
        next(err)
    }

}


const getWorkspaces = async (req, res, next) => {

    try {

        const workspaces = await workspaceService.getUserWorkspaces(req.user.id)

        res.json(workspaces)

    } catch (err) {
        next(err)
    }

}

const deleteWorkspace = async (req, res, next) => {
  try {

    const { workspaceId } = req.params

    await workspaceService.deleteWorkspace(workspaceId)

    res.json({
      message: "Workspace deleted successfully"
    })

  } catch (err) {
    next(err)
  }
}


const getWorkspaceMembers = async (req, res, next) => {

  try {

    const { workspaceId } = req.params

    const members = await workspaceService.getWorkspaceMembers(workspaceId)

    res.json(members)

  } catch (err) {
    next(err)
  }

}


const inviteMember = async (req, res, next) => {

  try {

    const { workspaceId } = req.params

    const data = inviteMemberSchema.parse(req.body)

    const member = await workspaceService.inviteMember(workspaceId, data)

    res.status(201).json({
      message: "Member added",
      member
    })

  } catch (err) {
    next(err)
  }

}


const removeMember = async (req, res, next) => {

  try {

    const { workspaceId, userId } = req.params

    await workspaceService.removeMember(
      workspaceId,
      userId,
      req.user.id
    )

    res.json({
      message: "Member removed successfully"
    })

  } catch (err) {
    next(err)
  }

}


const updateMemberRole = async (req, res, next) => {

  try {

    const { workspaceId, userId } = req.params

    const data = updateRoleSchema.parse(req.body)

    const member = await workspaceService.updateMemberRole(
      workspaceId,
      userId,
      data.role
    )

    res.json({
      message: "Role updated",
      member
    })

  } catch (err) {
    next(err)
  }

}


const getWorkspaceById = async (req, res, next) => {

  try {

    const { workspaceId } = req.params

    const workspace = await workspaceService.getWorkspaceById(workspaceId)

    res.json(workspace)

  } catch (err) {
    next(err)
  }

}


const updateWorkspace = async (req, res, next) => {

  try {

    const { workspaceId } = req.params

    const data = updateWorkspaceSchema.parse(req.body)

    const workspace = await workspaceService.updateWorkspace(
      workspaceId,
      data
    )

    res.json({
      message: "Workspace updated",
      workspace
    })

  } catch (err) {
    next(err)
  }

}


const transferOwnership = async (req, res, next) => {

  try {

    const { workspaceId } = req.params

    const data = transferOwnershipSchema.parse(req.body)

    const workspace = await workspaceService.transferOwnership(
      workspaceId,
      req.user.id,
      data.newOwnerId
    )

    res.json({
      message: "Ownership transferred",
      workspace
    })

  } catch (err) {
    next(err)
  }

}

module.exports = {
    createWorkspace,
    getWorkspaces,
    deleteWorkspace,
    getWorkspaceMembers,
    inviteMember,
    removeMember,
    updateMemberRole,
    getWorkspaceById,
    updateWorkspace,
    transferOwnership
}