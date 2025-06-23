const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema({
  orderId: { type: String, unique: true }, // UUID
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  paymentMethod: { type: String, required: true },
  orderDate: { type: Date, default: Date.now },
  paymentStatus: { type: String },
  status: { 
    type: String, 
    enum: ["pending", "processing", "shipped", "delivered", "cancelled", "return request", "returned", "failed"], 
    default: "pending" 
  },
  address: { type: mongoose.Schema.Types.ObjectId, ref: "Address", required: true },
  items: [
    {
      productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
      size: { type: String, required: true }, 
      quantity: { type: Number, required: true, min: 1 },
      itemSalePrice: { type: Number },
      status: { // Changed from itemStatus to status for consistency
        type: String, 
        enum: ["pending", "processing", "shipped", "delivered", "cancelled", "return request", "returned"], 
        default: "pending" 
      },
      cancelReason: { type: String }, // Added for individual item cancellation
      reason: { type: String }, // Keep existing for other purposes
      requestQuantity: { type: Number },
    },
  ],
  transactionId: { type: String },
  couponId: { type: mongoose.Schema.Types.ObjectId, ref: "Coupon" },
  amountPaid: { type: Number },
  totalAmount: { type: Number, required: true },
  deliveredDate: { type: Date },
  
  // Added fields for order-level cancellation
  cancelReason: { type: String }, // For entire order cancellation
  discount: { type: Number, default: 0 }, // Added missing discount field

  // for return request....
  returnRequest: {
    isRequested: { type: Boolean, default: false },
    reason: { type: String },
    requestedAt: { type: Date },
    processedAt: { type: Date },
  },
});

module.exports = mongoose.model("Order", orderSchema);