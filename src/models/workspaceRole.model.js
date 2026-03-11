const mongoose = require("mongoose")

const workspaceMemberSchema = new mongoose.Schema(
{
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },

  workspace: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Workspace",
    required: true
  },

  role: {
    type: String,
    enum: ["owner", "admin", "member", "guest"],
    default: "member"
  }

},
{ timestamps: true }
)


workspaceMemberSchema.index(
  { user: 1, workspace: 1 },
  { unique: true }
)


module.exports = mongoose.model("WorkspaceMember", workspaceMemberSchema)