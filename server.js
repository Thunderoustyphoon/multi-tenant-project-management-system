require("dotenv").config()
const connectDB = require("./src/config/db")
connectDB()
const app = require("./src/app")


const PORT = process.env.PORT

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})