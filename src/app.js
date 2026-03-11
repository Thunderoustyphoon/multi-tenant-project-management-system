const express = require("express")
const helmet = require("helmet")
const cookieParser = require("cookie-parser")
const routes = require("./routes")
const errorHandler = require("./middlewares/error.middleware")
const { apiLimiter } = require("./middlewares/rateLimit.middleware")
const cors = require("cors")

const app = express()

app.use(express.json())
app.use(helmet(
    {crossOriginResourcePolicy: { policy: "cross-origin" }}
))
app.use(cookieParser())
app.use(cors())


app.get("/", (req, res)=>{
    res.send ("Server is running....")
})


app.use("/api", apiLimiter)
app.use("/api", routes)


app.use(errorHandler)

module.exports = app