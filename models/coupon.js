const mongoose = require("mongoose");

const couponSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
  },
  discountAmount: {
    type: Number,
    required: true,
  },
  discountType: {
    type: String,
    enum: ["percentage", "fixed"],
    default: "fixed",
  },
  maxDiscount: {
    type: Number,
    default: null, // Only applicable for percentage discounts
  },
  minCartAmount: {
    type: Number,
    default: 0,
  },
  expiresAt: {
    type: Date,
    required: true,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  userId: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  }],
}, { timestamps: true });

const Coupon = mongoose.model("Coupon", couponSchema);

module.exports = Coupon;