const mongoose = require("mongoose")


const userSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
        },
        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true
        },

        password: {
            type: String,
            required: true
        },

        avatar: {
            type: String,
            default: null
        },

        isEmailVerified: {
            type: Boolean,
            default: false
        },

        status: {
            type: String,
            enum: ["active", "suspended"],
            default: "active"
        }
    }, { timestamps: true })

module.exports = mongoose.model("User", userSchema)