const mongoose = require('mongoose');

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
    required: true
  },
  minCartAmount: {
    type: Number,
    default: 0
  },
  maxDiscount: {
    type: Number,
  },
  expiresAt: {
    type: Date,
    required: true
  },
  usageLimit: {
    type: Number,
    default: 1
  },
  isActive: {
    type: Boolean,
    default: true
  },
  userId:[{ 
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"}]
}, { timestamps: true });

const Coupon = mongoose.model('Coupon', couponSchema);

module.exports = Coupon;