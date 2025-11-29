const mongoose = require("mongoose");

const itemSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      trim: true,
    },
    
    category: {
      type: String,
      required: true,
      trim: true,
    },

    location: {
      type: String,
      required: true,
      trim: true,
    },

    status: {
      type: String,
      enum: ["LOST", "FOUND"],
      required: true,
    },

    date: {
      type: Date,
      required: true,
    },

    imageUrl: {
      type: String,   
      required: true,
    },

    description: {
      type: String,
      trim: true,
    },

    postedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  }
);

itemSchema.index({ category: 'text', description: 'text', location: 'text' });

const Items=mongoose.model("Item", itemSchema);

module.exports=Items