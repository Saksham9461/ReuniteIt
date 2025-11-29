require('dotenv').config();
const mongoose = require('mongoose');

(async () => {
  try {
    console.log('Trying to connect to DB...');
    await mongoose.connect(process.env.MONGO_URL, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 20000
    });
    console.log('CONNECTED ✓');
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('CONNECT ERROR:', err);
    process.exit(1);
  }
})();
