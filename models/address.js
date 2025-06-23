const mongoose = require("mongoose");

const addressSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  address: [
    {
      name: { type: String, required: true },
      phone: { type: String, required: true },
      altPhone: { type: String },
      city: { type: String, required: true },
      state: { type: String, required: true },
      pincode: { type: String, required: true },
      landMark: { type: String },
      addressType: {
        type: String,
        enum: ["Home", "Work"],
        default: "Home"
      },
      isDefault: { 
        type: Boolean, 
        default: false 
      },
      status: { 
        type: String, 
        enum: ["active", "inactive"], 
        default: "active" 
      },
      createdAt: { 
        type: Date, 
        default: Date.now 
      }
    }
  ]
});

module.exports = mongoose.model("Address", addressSchema);