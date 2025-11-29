// // require("dotenv").config();    
// // const mongoose = require("mongoose");
// // const initData = require("./data.js");
// // const Items = require("../models/items.js");

// // main()
// //   .then(console.log("Database Connected!"))
// //   .catch(err => console.log(err));

// // async function main() {
// //   await mongoose.connect(process.env.MONGO_URL || 'mongodb://127.0.0.1:27017/reuniteit', {
// //     useNewUrlParser: true,
// //     useUnifiedTopology: true
// //   });
// // }

// // const initDB = async () => {
// //   await Items.deleteMany({});
// //   await Items.insertMany(initData.item);
// //   console.log("data was initialized");
// // };

// // initDB();


// require("dotenv").config();
// const mongoose = require("mongoose");
// const initData = require("./data.js");
// const Items = require("../models/items.js");

// main()
//   .then(() => console.log("Database Connected!"))
//   .catch(err => console.log(err));

// async function main() {
//   await mongoose.connect(process.env.MONGO_URL || 'mongodb://127.0.0.1:27017/reuniteit', {
//     useNewUrlParser: true,
//     useUnifiedTopology: true
//   });
// }

// const initDB = async () => {
//   await Items.insertMany(initData.item);
//   console.log("data was initialized");
//   mongoose.connection.close();   // important
// };

// initDB();


require("dotenv").config();
const mongoose = require("mongoose");
const initData = require("./data.js");
const Items = require("../models/items.js");

async function main() {
  await mongoose.connect(process.env.MONGO_URL);
  console.log("MongoDB Connected ✓");
}

async function initDB() {
  await Items.insertMany(initData.item);
  console.log("Dummy Data Inserted ✓");
  process.exit(); 
}

main()
  .then(initDB)
  .catch(err => console.log("Error:", err));
