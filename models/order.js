const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema({
  orderId: { type: String, unique: true }, 
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  paymentMethod: { type: String, required: true },
  orderDate: { type: Date, default: Date.now },
  paymentStatus: { type: String },
  status: { 
    type: String, 
    enum: ["pending", "processing", "shipped", "delivered", "cancelled", "return request", "returned", "partially returned", "failed"], 
    default: "pending" 
  },
  address: { type: mongoose.Schema.Types.ObjectId, ref: "Address", required: true },
  items: [
    {
      productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
      size: { type: String, required: true }, 
      quantity: { type: Number, required: true, min: 1 },
      itemSalePrice: { type: Number },
      status: { 
        type: String, 
        enum: ["pending", "processing", "shipped", "delivered", "cancelled", "return request", "returned","failed"], 
        default: "pending" 
      },
      cancelReason: { type: String },
      reason: { type: String }, 
      requestQuantity: { type: Number },

      returnRequested: { type: Boolean, default: false },
      returnReason: { type: String },
      returnRequestedAt: { type: Date },
    },
  
  ],
  transactionId: { type: String },
  couponId: { type: mongoose.Schema.Types.ObjectId, ref: "Coupon" },
  amountPaid: { type: Number },
  totalAmount: { type: Number, required: true },
  deliveredDate: { type: Date },

  razorpayPaymentId: { type: String }, 
  razorpaySignature: { type: String }, 
  paymentDate: { type: Date }, 
  paymentFailureReason: { type: String }, 
  paymentAttempts: { type: Number, default: 0 }, 
  lastPaymentAttempt: { type: Date },
  
  
  isPaymentVerified: { type: Boolean, default: false },
  verificationDate: { type: Date },
  verificationAttempts: { type: Number, default: 0 },

  
  cancelReason: { type: String }, 
  discount: { type: Number, default: 0 }, 

  returnRequest: {
    isRequested: { type: Boolean, default: false },
    reason: { type: String },
    requestedAt: { type: Date },
    processedAt: { type: Date },
  },
  
},{timestamps: true});

module.exports = mongoose.model("Order", orderSchema);