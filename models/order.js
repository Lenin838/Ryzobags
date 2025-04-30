const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  items: [{
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true
    },
    quantity: {
      type: Number,
      required: true,
      default:1
    }
  }],
  address: {
    addressType:String,
    name: String,
    city: String,
    state: String,
    pincode: Number,
    landmark: String,
    phone: String,
    altPhone: String
  },
  paymentMethod: {
    type: String,
    enum: ["COD", "Online"],
    default: "COD"
  },
  totalAmount: {type:Number, required: true},
  status: {
    type: String,
    enum: ["Pending", "Placed", "Shipped", "Delivered", "Cancelled"],
    default: "Placed"
  },
  returnReason: {
    type: String,
    default: null
  },
  isReturnRequested: {
    type: Boolean,
    default: false
  },
  couponApplied:{type:String},
  discountAmount:{type:Number, default:0},
}, { timestamps: true });

const Order = mongoose.model("Order", orderSchema);
module.exports = Order;