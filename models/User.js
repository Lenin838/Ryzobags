const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
  },
  password: {
    type: String,
    required: false,
  },
  fullname: {
    type: String,
    required: true,
  },
  phoneNumber: {
    type: String,
    required: false,
  },
  googleId: {
    type: String,
    unique: true,
    sparse: true,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  profileImage: { 
    type: String 
  },
  resetToken: String,
  resetTokenExpire: Date,
  otp: {
    type: String,
    required: false,
  },
  otpExpire: {
    type: Date,
    required: false,
  },
  isVerified: {
    type: Boolean,
    default: false,
  },
  referralCode: {
    type: String,
    unique: true,
    uppercase: true,
    sparse: true
  },
  referredBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null
  }
}, {
  timestamps: true,
});

module.exports = mongoose.model("User", userSchema);