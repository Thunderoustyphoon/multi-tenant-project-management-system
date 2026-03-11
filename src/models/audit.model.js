const mongoose = require("mongoose")

const auditLogSchema = new mongoose.Schema(
{
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },

  action: {
    type: String,
    required: true
  },

  workspace: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Workspace"
  },

  metadata: Object

},
{ timestamps: true }
)

module.exports = mongoose.model("AuditLog", auditLogSchema)