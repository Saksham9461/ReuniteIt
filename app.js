// ---------- config & imports ----------
require("dotenv").config();
const express = require("express");
const app = express();
const port = process.env.PORT || 8080;


const path = require("path");
const fs = require("fs");
const compression = require("compression");
const mongoose = require("mongoose");
const expressLayouts = require('express-ejs-layouts');
const cookieParser = require("cookie-parser");

// Models
const Item = require("./models/items.js");
const User = require("./models/user.js");

// ---------- compression (GZIP) ----------
app.use(compression());

// ---------- file upload (cloudinary) setup ----------
const upload = require("./utils/cloudinary");


// ---------- Express / View setup ----------
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(expressLayouts);
app.set('layout', 'layouts/main');

// // ---------- Mongoose connect ----------
// main()
//   .then(() => console.log("Database Connected!"))
//   .catch(err => console.log("DB Connection Error:", err));

// async function main() {
//   try {
//     await mongoose.connect(process.env.MONGO_URL || 'mongodb://127.0.0.1:27017/reuniteit', {
//       useNewUrlParser: true,
//       useUnifiedTopology: true,
//       useNewUrlParser: true,
//       useUnifiedTopology: true,
//       serverSelectionTimeoutMS: 30000, // increase wait time during dev (30s)
//       socketTimeoutMS: 45000,
//       family: 4 // try IPv4 first
//     });
//     console.log('MongoDB connected ✓');
//   } catch (err) {
//     console.error('MongoDB connection error:', err.message || err);
//     // helpful suggestions for quick debugging
//     console.error('Make sure MONGO_URL is correct, IP is whitelisted in Atlas, and credentials are valid.');
//     // exit or retry policy — for now exit so the error is visible
//     process.exit(1);
//   }
// }

// ---------- DB connect + bootstrap (replace your current mongoose connect / app.listen) ----------
const MONGO_URL = process.env.MONGO_URL || 'mongodb://127.0.0.1:27017/reuniteit';

// CONNECT WITH RETRIES (useful for Atlas cold starts, flaky networks)
async function connectWithRetry({ retries = 4, delayMs = 3000 } = {}) {
  let attempt = 0;
  while (attempt <= retries) {
    try {
      attempt++;
      console.log(`MongoDB: connecting (attempt ${attempt}/${retries + 1})...`);
      await mongoose.connect(MONGO_URL, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        serverSelectionTimeoutMS: 30000,
        socketTimeoutMS: 45000,
        family: 4
      });
      console.log('MongoDB connected ✓');
      // optional listeners
      mongoose.connection.on('error', (e) => console.error('MongoDB connection error:', e));
      mongoose.connection.on('disconnected', () => console.warn('MongoDB disconnected'));
      return;
    } catch (err) {
      console.error(`MongoDB connect failed (attempt ${attempt}):`, err.message || err);
      if (attempt > retries) {
        console.error('MongoDB: exhausted retries — aborting startup.');
        throw err;
      }
      const wait = delayMs * attempt;
      console.log(`Retrying in ${wait}ms... (check Atlas IP whitelist & MONGO_URL)`);
      await new Promise(r => setTimeout(r, wait));
    }
  }
}

// bootstrap function: connect DB, then start server
(async function bootstrap() {
  try {
    await connectWithRetry({ retries: 4, delayMs: 3000 });
    // DB ready — start express server
    app.listen(port, () => {
      console.log(`Server started on port ${port}`);
    });
  } catch (err) {
    console.error('Fatal - could not connect to the database. Exiting.');
    // exit - so you notice and fix Atlas/network/URI
    process.exit(1);
  }
})();


// ---------- Helper: escape regex ----------
function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---------- Middleware: template defaults & hideAuthNav default ----------
app.use((req, res, next) => {
  // ensure templates always have these variables (prevents EJS reference errors)
  res.locals.formData = res.locals.formData || {};
  res.locals.errors = res.locals.errors || [];
  res.locals.hideAuthNav = typeof res.locals.hideAuthNav !== 'undefined' ? res.locals.hideAuthNav : false;
  next();
});

// ---------- Middleware: currentUser available in all views ----------
app.use(async (req, res, next) => {
  try {
    res.locals.currentUser = null;
    const userId = req.cookies && req.cookies.userId;
    if (userId && mongoose.Types.ObjectId.isValid(userId)) {
      const user = await User.findById(userId).select("fullName email").lean();
      if (user) {
        // keep _id as string for easy comparison in templates
        user._id = user._id.toString();
        res.locals.currentUser = user;
      }
    }
  } catch (err) {
    console.error("Error loading current user:", err);
    res.locals.currentUser = null;
  }
  next();
});

// ---------- SITE BASE URL (for meta tags) ----------
const BASE_URL = process.env.BASE_URL || "http://localhost:" + port;

// -------------------- ROUTES --------------------

// Home page (index)
// Note: hideAuthNav set to true here as per your earlier preference for homepage
app.get("/", async (req, res) => {
  try {
    const items = await Item.find().sort({ createdAt: -1 }).lean();
    return res.render("pages/index.ejs", {
      title: "ReuniteIt | Reuniting Lost Items",
      description: "Search and report lost or found items easily and quickly.",
      url: BASE_URL + "/",
      items,
      hideAuthNav: true
    });
  } catch (err) {
    console.error("GET / error:", err);
    return res.status(500).render("pages/index.ejs", {
      title: "ReuniteIt | Reuniting Lost Items",
      description: "Search and report lost or found items easily and quickly.",
      url: BASE_URL + "/",
      items: [],
      errors: ["Unable to load items right now."],
      hideAuthNav: true
    });
  }
});

// ---------- AUTH ROUTES ----------

// Login - GET
app.get("/login", (req, res) => {
  res.render("pages/login.ejs", {
    title: "Login | ReuniteIt",
    description: "Login to your ReuniteIt account to report or manage items.",
    url: BASE_URL + "/login",
    errors: [],
    formData: {}
  });
});

// Login - POST
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.render("pages/login.ejs", {
        title: "Login | ReuniteIt",
        description: "Login to your ReuniteIt account to report or manage items.",
        url: BASE_URL + "/login",
        errors: ["Email and Password are required"],
        formData: { email }
      });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.render("pages/login.ejs", {
        title: "Login | ReuniteIt",
        description: "Login to your ReuniteIt account to report or manage items.",
        url: BASE_URL + "/login",
        errors: ["No account found with this email"],
        formData: { email }
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.render("pages/login.ejs", {
        title: "Login | ReuniteIt",
        description: "Login to your ReuniteIt account to report or manage items.",
        url: BASE_URL + "/login",
        errors: ["Incorrect password"],
        formData: { email }
      });
    }

    // SUCCESS: set httpOnly cookie
    res.cookie("userId", user._id.toString(), {
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000
    });

    return res.redirect("/dashboard");
  } catch (err) {
    console.error("Login Error:", err);
    return res.render("pages/login.ejs", {
      title: "Login | ReuniteIt",
      description: "Login to your ReuniteIt account to report or manage items.",
      url: BASE_URL + "/login",
      errors: ["Something went wrong! Try again."],
      formData: { email: req.body.email || "" }
    });
  }
});

// Signup - GET
app.get("/signup", (req, res) => {
  res.render("pages/signup.ejs", {
    title: "SignUp | ReuniteIt",
    description: "Create an account to report lost or found items and manage your reports.",
    url: BASE_URL + "/signup",
    formData: {},
    errors: []
  });
});

// Signup - POST
app.post("/signup", async (req, res) => {
  try {
    let { fullName, email, password } = req.body;

    if (!fullName || !email || !password) {
      return res.render("pages/signup.ejs", {
        title: "SignUp | ReuniteIt",
        description: "Create an account to report lost or found items and manage your reports.",
        url: BASE_URL + "/signup",
        errors: ["All fields are required"],
        formData: { fullName, email }
      });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.render("pages/signup.ejs", {
        title: "SignUp | ReuniteIt",
        description: "Create an account to report lost or found items and manage your reports.",
        url: BASE_URL + "/signup",
        errors: ["Email already exists"],
        formData: { fullName, email }
      });
    }

    if (password.length < 6) {
      return res.render("pages/signup.ejs", {
        title: "SignUp | ReuniteIt",
        description: "Create an account to report lost or found items and manage your reports.",
        url: BASE_URL + "/signup",
        errors: ["Password must be at least 6 characters"],
        formData: { fullName, email }
      });
    }

    const newUser = new User({
      fullName,
      email,
      password
    });

    await newUser.save();

    return res.redirect("/login?registered=1");
  } catch (err) {
    console.error("Signup Error:", err);
    let message = "Something went wrong! Please try again.";
    if (err.name === "ValidationError") {
      message = Object.values(err.errors).map(e => e.message).join(", ");
    }
    return res.render("pages/signup.ejs", {
      title: "SignUp | ReuniteIt",
      description: "Create an account to report lost or found items and manage your reports.",
      url: BASE_URL + "/signup",
      errors: [message],
      formData: { fullName: req.body.fullName, email: req.body.email }
    });
  }
});

// Logout (support both GET and POST)
app.get("/logout", (req, res) => {
  res.clearCookie("userId");
  return res.redirect("/");
});
app.post("/logout", (req, res) => {
  res.clearCookie("userId");
  return res.redirect("/login");
});

// ---------- Search route (page-level search) ----------
app.get("/search", async (req, res) => {
  try {
    const q = req.query.q ? req.query.q.trim() : "";

    const filter = {};
    if (q) {
      const regex = new RegExp(escapeRegex(q), "i");
      filter.$or = [
        { category: regex },
        { description: regex },
        { location: regex }
      ];
    }

    const items = await Item.find(filter).sort({ createdAt: -1 }).lean();

    return res.render("pages/index.ejs", {
      title: q ? `Search: ${q} | ReuniteIt` : "ReuniteIt | Reuniting Lost Items",
      description: q ? `Search results for "${q}" - ReuniteIt` : "Search and report lost or found items easily and quickly.",
      url: BASE_URL + "/search?q=" + encodeURIComponent(q || ""),
      items,
      q
    });
  } catch (err) {
    console.error("Search error:", err);
    return res.status(500).render("pages/index.ejs", {
      title: "ReuniteIt | Reuniting Lost Items",
      description: "Search and report lost or found items easily and quickly.",
      url: BASE_URL + "/search",
      items: [],
      q: req.query.q || "",
      errors: ["Unable to perform search right now. Try again later."]
    });
  }
});
//
app.get("/searchs", async (req, res) => {
  try {
    const q = req.query.q ? req.query.q.trim() : "";

    const filter = {};
    if (q) {
      const regex = new RegExp(escapeRegex(q), "i");
      filter.$or = [
        { category: regex },
        { description: regex },
        { location: regex }
      ];
    }

    const items = await Item.find(filter).sort({ createdAt: -1 }).lean();

    return res.render("pages/all.ejs", {
      title: q ? `Search: ${q} | ReuniteIt` : "ReuniteIt | Reuniting Lost Items",
      description: q ? `Search results for "${q}" - ReuniteIt` : "Search and report lost or found items easily and quickly.",
      url: BASE_URL + "/searchs?q=" + encodeURIComponent(q || ""),
      items,
      q
    });
  } catch (err) {
    console.error("Search error:", err);
    return res.status(500).render("pages/all.ejs", {
      title: "ReuniteIt | Reuniting Lost Items",
      description: "Search and report lost or found items easily and quickly.",
      url: BASE_URL + "/searchs",
      items: [],
      q: req.query.q || "",
      errors: ["Unable to perform searchs right now. Try again later."]
    });
  }
});

// ---------- Items & listing ----------
app.get("/items", async (req, res) => {
  try {
    const items = await Item.find().sort({ createdAt: -1 }).lean();
    res.render("pages/all.ejs", {
      title: "All Items | ReuniteIt",
      description: "Browse all lost and found items reported by the community.",
      url: BASE_URL + "/items",
      items
    });
  } catch (err) {
    console.error("GET /items error:", err);
    res.status(500).render("pages/all.ejs", {
      title: "All Items | ReuniteIt",
      description: "Browse all lost and found items reported by the community.",
      url: BASE_URL + "/items",
      items: [],
      errors: ["Unable to load items."]
    });
  }
});

// Item details
app.get("/items/:id", async (req, res) => {
  let { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).send("Invalid item ID");
  }
  try {
    let item = await Item.findById(id).lean();
    if (!item) return res.status(404).send("Item not found");
    res.render("pages/item-details.ejs", {
      title: `${item.category} - Item Details | ReuniteIt`,
      description: item.description || `Details for ${item.category}`,
      url: BASE_URL + "/items/" + item._id,
      ogImage: item.imageUrl || "",
      item
    });
  } catch (err) {
    console.error("GET /items/:id error:", err);
    res.status(500).send("Server error");
  }
});

// ---------- Dashboard (protected) ----------
app.get("/dashboard", async (req, res) => {
  try {
    const userId = req.cookies && req.cookies.userId;
    if (!userId) return res.redirect("/login");

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      res.clearCookie("userId");
      return res.redirect("/login");
    }

    const user = await User.findById(userId).select("fullName email").lean();
    if (!user) {
      res.clearCookie("userId");
      return res.redirect("/login");
    }

    // make currentUser available in templates
    res.locals.currentUser = user;

    const items = await Item.find().lean();

    return res.render("pages/dashboard.ejs", {
      title: "Dashboard | ReuniteIt",
      description: "Your dashboard — manage your reported items and view site activity.",
      url: BASE_URL + "/dashboard",
      user,
      items
    });
  } catch (err) {
    console.error("Dashboard error:", err);
    return res.status(500).render("pages/dashboard.ejs", {
      title: "Dashboard | ReuniteIt",
      description: "Your dashboard — manage your reported items and view site activity.",
      url: BASE_URL + "/dashboard",
      items: [],
      errors: ["Unable to load dashboard. Please try again later."]
    });
  }
});

// ---------- Profile & Profile Edit ----------
app.get("/profile", async (req, res) => {
  try {
    const userId = req.cookies && req.cookies.userId;
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.redirect("/login");
    }

    const user = await User.findById(userId).select("fullName email").lean();
    if (!user) {
      res.clearCookie("userId");
      return res.redirect("/login");
    }

    const reports = await Item.find({ postedBy: user._id }).sort({ createdAt: -1 }).lean();

    return res.render("pages/profile.ejs", {
      title: "Profile | ReuniteIt",
      description: "View and manage your reported lost & found items.",
      url: BASE_URL + "/profile",
      user,
      reports
    });
  } catch (err) {
    console.error("GET /profile error:", err);
    return res.status(500).render("pages/profile.ejs", {
      title: "Profile | ReuniteIt",
      description: "View and manage your reported lost & found items.",
      url: BASE_URL + "/profile",
      user: null,
      reports: [],
      errors: ["Unable to load profile. Please try again later."]
    });
  }
});

app.get("/profile/edit", async (req, res) => {
  try {
    const userId = req.cookies && req.cookies.userId;
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) return res.redirect("/login");

    const user = await User.findById(userId).lean();
    if (!user) {
      res.clearCookie("userId");
      return res.redirect("/login");
    }

    return res.render("pages/profile-edit.ejs", {
      title: "Edit Profile | ReuniteIt",
      description: "Edit your account details.",
      url: BASE_URL + "/profile/edit",
      user,
      errors: [],
      formData: { fullName: user.fullName, email: user.email }
    });
  } catch (err) {
    console.error("GET /profile/edit error:", err);
    return res.status(500).redirect("/profile");
  }
});

app.post("/profile/edit", async (req, res) => {
  try {
    const userId = req.cookies && req.cookies.userId;
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) return res.redirect("/login");

    const { fullName, email } = req.body;
    const errors = [];

    if (!fullName || !fullName.trim()) errors.push("Full name is required");
    if (!email || !email.trim()) errors.push("Email is required");

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (email && !emailRegex.test(email)) errors.push("Enter a valid email");

    if (errors.length) {
      return res.render("pages/profile-edit.ejs", {
        title: "Edit Profile | ReuniteIt",
        description: "Edit your account details.",
        url: BASE_URL + "/profile/edit",
        errors,
        formData: { fullName, email }
      });
    }

    const existing = await User.findOne({ email: email.toLowerCase(), _id: { $ne: userId } });
    if (existing) {
      return res.render("pages/profile-edit.ejs", {
        title: "Edit Profile | ReuniteIt",
        description: "Edit your account details.",
        url: BASE_URL + "/profile/edit",
        errors: ["Email already in use by another account"],
        formData: { fullName, email }
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      res.clearCookie("userId");
      return res.redirect("/login");
    }

    user.fullName = fullName.trim();
    user.email = email.toLowerCase().trim();
    await user.save();

    res.locals.currentUser = { fullName: user.fullName, email: user.email, _id: user._id.toString() };

    return res.redirect("/profile");
  } catch (err) {
    console.error("POST /profile/edit error:", err);
    return res.status(500).render("pages/profile-edit.ejs", {
      title: "Edit Profile | ReuniteIt",
      description: "Edit your account details.",
      url: BASE_URL + "/profile/edit",
      errors: ["Server error, please try again"],
      formData: { fullName: req.body.fullName, email: req.body.email }
    });
  }
});

// ---------- Delete report (owner only) ----------
app.post("/reports/:id/delete", async (req, res) => {
  try {
    const reportId = req.params.id;
    const userId = req.cookies && req.cookies.userId;

    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.redirect("/login");
    }
    if (!mongoose.Types.ObjectId.isValid(reportId)) {
      return res.status(400).send("Invalid report id");
    }

    const report = await Item.findById(reportId);
    if (!report) {
      return res.status(404).send("Report not found");
    }

    if (!report.postedBy || report.postedBy.toString() !== userId.toString()) {
      return res.status(403).send("Not authorized to delete this report");
    }

    await Item.deleteOne({ _id: reportId });
    return res.redirect("/profile");
  } catch (err) {
    console.error("Delete report error:", err);
    return res.status(500).send("Server error");
  }
});

// ---------- Report Found (GET + POST) ----------
app.get("/report-found", async (req, res) => {
  try {
    const userId = req.cookies && req.cookies.userId;
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.redirect("/login");
    }

    const user = await User.findById(userId).select("fullName email").lean();
    if (!user) {
      res.clearCookie("userId");
      return res.redirect("/login");
    }

    return res.render("pages/rfound.ejs", {
      title: "Report Found | ReuniteIt",
      description: "Report an item you found so the owner can be reunited with it.",
      url: BASE_URL + "/report-found",
      formData: {},
      errors: [],
      user
    });
  } catch (err) {
    console.error("GET /report-found error:", err);
    return res.status(500).render("pages/rfound.ejs", {
      title: "Report Found | ReuniteIt",
      description: "Report an item you found so the owner can be reunited with it.",
      url: BASE_URL + "/report-found",
      formData: {},
      errors: ["Unable to load form. Please try again later."]
    });
  }
});

app.post("/report-found", upload.single("image"), async (req, res) => {
  try {
    const userId = req.cookies.userId;
    if (!userId) return res.redirect("/login");

    const user = await User.findById(userId);

    const { category, description, date, location } = req.body;

    if (!category || !description || !date || !location || !req.file) {
      return res.render("pages/rfound.ejs", {
        title: "Report Found | ReuniteIt",
        errors: ["All fields including image are required"],
        formData: req.body
      });
    }

    const newItem = new Item({
      name: user.fullName,
      email: user.email,
      category,
      location,
      status: "FOUND",
      date,
      imageUrl: req.file.path,
      description,
      postedBy: user._id,
    });

    await newItem.save();
    res.redirect("/dashboard");

  } catch (err) {
    console.log(err);
    res.render("pages/rfound.ejs", {
      title: "Report Found | ReuniteIt",
      errors: ["Server error"],
    });
  }
});


// ---------- Report Lost (GET + POST) ----------
app.get("/report-lost", async (req, res) => {
  try {
    const userId = req.cookies && req.cookies.userId;
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.redirect("/login");
    }

    const user = await User.findById(userId).select("fullName email").lean();
    if (!user) {
      res.clearCookie("userId");
      return res.redirect("/login");
    }

    return res.render("pages/rlost.ejs", {
      title: "Report Lost | ReuniteIt",
      description: "Report an item you lost so the community can help find it.",
      url: BASE_URL + "/report-lost",
      formData: {},
      errors: [],
      user
    });
  } catch (err) {
    console.error("GET /report-lost error:", err);
    return res.status(500).render("pages/rlost.ejs", {
      title: "Report Lost | ReuniteIt",
      description: "Report an item you lost so the community can help find it.",
      url: BASE_URL + "/report-lost",
      formData: {},
      errors: ["Unable to load form. Please try again later."]
    });
  }
});

app.post("/report-lost", upload.single("image"), async (req, res) => {
  try {
    const userId = req.cookies.userId;
    if (!userId) return res.redirect("/login");

    const user = await User.findById(userId);
    if (!user) return res.redirect("/login");

    const { category, description, date, location } = req.body;

    if (!category || !description || !date || !location || !req.file) {
      return res.render("pages/rlost.ejs", {
        title: "Report Lost | ReuniteIt",
        errors: ["All fields including image are required"],
        formData: req.body,
        user
      });
    }

    const newItem = new Item({
      name: user.fullName,
      email: user.email,
      category,
      location,
      status: "LOST",
      date,
      imageUrl: req.file.path,   // CLOUDINARY URL ⭐
      description,
      postedBy: user._id
    });

    await newItem.save();

    return res.redirect("/dashboard");

  } catch (err) {
    console.error("Report Lost Error:", err);
    return res.render("pages/rlost.ejs", {
      title: "Report Lost | ReuniteIt",
      errors: ["Server error, try again later"],
      formData: req.body
    });
  }
});


// ---------- Static pages ----------
app.get("/about-us", (req, res) => res.render("pages/about.ejs", {
  title: "About Us | ReuniteIt",
  description: "Learn more about ReuniteIt and our mission to reunite lost items with their owners.",
  url: BASE_URL + "/about-us"
}));
app.get("/contact", (req, res) => res.render("pages/contact.ejs", {
  title: "Contact | ReuniteIt",
  description: "Get in touch with the ReuniteIt team for support or partnership inquiries.",
  url: BASE_URL + "/contact"
}));
app.get("/privacy-policy", (req, res) => res.render("pages/privacy.ejs", {
  title: "Privacy Policy | ReuniteIt",
  description: "Read our privacy policy and how we handle user data responsibly.",
  url: BASE_URL + "/privacy-policy"
}));
app.get("/terms-of-service", (req, res) => res.render("pages/term.ejs", {
  title: "Terms of Service | ReuniteIt",
  description: "Read the terms of service for using ReuniteIt.",
  url: BASE_URL + "/terms-of-service"
}));

// ------------------- ADMIN (simple fixed-credential auth) -------------------

// Helper: require admin middleware
function requireAdmin(req, res, next) {
  try {
    // check admin cookie
    const isAdmin = req.cookies && req.cookies.adminAuth === "1";
    if (!isAdmin) return res.redirect("/admin/login");
    return next();
  } catch (err) {
    console.error("requireAdmin error:", err);
    return res.redirect("/admin/login");
  }
}

// Admin login page (GET)
app.get("/admin/login", (req, res) => {
  // if already logged in, redirect
  if (req.cookies && req.cookies.adminAuth === "1") return res.redirect("/admin/dashboard");

  res.render("admin/login.ejs", {
    title: "Admin Login | ReuniteIt",
    layout: "layouts/admin",
    description: "Admin login",
    url: BASE_URL + "/admin/login",
    errors: [],
    formData: {}
  });
});

// Admin login handler (POST)
app.post("/admin/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const expectedEmail = process.env.ADMIN_EMAIL;
    const expectedPassword = process.env.ADMIN_PASSWORD;

    // Basic validation
    if (!email || !password) {
      return res.render("admin/login.ejs", {
        title: "Admin Login | ReuniteIt",
        errors: ["Email and Password are required"],
        formData: { email }
      });
    }

    // Check credentials against env
    if (email.trim() === expectedEmail && password === expectedPassword) {
      // set httpOnly cookie (valid for 8 hours)
      res.cookie("adminAuth", "1", {
        httpOnly: true,
        // secure: true, // enable in production under HTTPS
        maxAge: 8 * 60 * 60 * 1000
      });
      return res.redirect("/admin/dashboard");
    }

    return res.render("admin/login.ejs", {
      title: "Admin Login | ReuniteIt",
      errors: ["Invalid admin credentials"],
      formData: { email }
    });
  } catch (err) {
    console.error("Admin login error:", err);
    return res.render("admin/login.ejs", {
      title: "Admin Login | ReuniteIt",
      errors: ["Server error. Try again."],
      formData: {}
    });
  }
});

// Admin logout
app.post("/admin/logout", (req, res) => {
  res.clearCookie("adminAuth");
  return res.redirect("/admin/login");
});

// Admin dashboard (protected)
app.get("/admin/dashboard", requireAdmin, async (req, res) => {
  try {
    // stats
    const totalUsers = await User.countDocuments();
    const totalReports = await Item.countDocuments();
    const totalLost = await Item.countDocuments({ status: "LOST" });
    const totalFound = await Item.countDocuments({ status: "FOUND" });
    const pending = await Item.countDocuments({ approved: { $exists: false } }); // not yet moderated

    // list data
    const users = await User.find().lean();
    const reports = await Item.find().sort({ createdAt: -1 }).lean();

    return res.render("admin/dashboard.ejs", {
      title: "Admin Dashboard | ReuniteIt",
      layout: "layouts/admin",
      description: "Admin control panel",
      url: BASE_URL + "/admin/dashboard",
      stats: { totalUsers, totalReports, totalLost, totalFound, pending },
      users,
      reports
    });
  } catch (err) {
    console.error("Admin dashboard error:", err);
    return res.status(500).render("admin/dashboard.ejs", {
      title: "Admin Dashboard | ReuniteIt",
      errors: ["Unable to load admin dashboard"],
      stats: { totalUsers: 0, totalReports: 0, totalLost: 0, totalFound: 0, pending: 0 },
      users: [],
      reports: []
    });
  }
});

// Approve report
app.post("/admin/report/:id/approve", requireAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).send("Invalid id");
    await Item.findByIdAndUpdate(id, { approved: true });
    return res.redirect("/admin/dashboard");
  } catch (err) {
    console.error("Approve report error:", err);
    return res.status(500).send("Server error");
  }
});

// Reject report
app.post("/admin/report/:id/reject", requireAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).send("Invalid id");
    await Item.findByIdAndUpdate(id, { approved: false });
    return res.redirect("/admin/dashboard");
  } catch (err) {
    console.error("Reject report error:", err);
    return res.status(500).send("Server error");
  }
});

// Delete report
app.post("/admin/report/:id/delete", requireAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).send("Invalid id");
    await Item.findByIdAndDelete(id);
    return res.redirect("/admin/dashboard");
  } catch (err) {
    console.error("Delete report error:", err);
    return res.status(500).send("Server error");
  }
});

// Delete user (and their reports)
app.post("/admin/user/:id/delete", requireAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).send("Invalid id");
    await User.findByIdAndDelete(id);
    await Item.deleteMany({ postedBy: id });
    return res.redirect("/admin/dashboard");
  } catch (err) {
    console.error("Delete user error:", err);
    return res.status(500).send("Server error");
  }
});


// ---------- 404 handler (last) ----------
app.use((req, res) => {
  res.status(404).render("pages/404.ejs", {
    title: "404 | Page Not Found",
    description: "The page you are looking for could not be found.",
    url: BASE_URL + req.originalUrl,
    hideAuthNav: true
  });
});

// ---------- start server ----------
app.listen(port, () => {
  console.log(`Port is active at :${port}`);
});
