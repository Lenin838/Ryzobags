const mongoose = require("mongoose");


const WalletTransactionSchema = new mongoose.Schema({
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    transactionId: {
      type: String,
      required: true,
      unique: true
    },
    productId:{
      type:String,
      required:true
    },
    amount: {
      type: Number,
      required: true
    },
    type: {
      type: String,
      enum: ['deposit', 'withdrawal', 'refund', 'payment'],
      required: true
    },
    status: {
      type: String,
      enum: ['pending', 'success', 'failed'],
      default: 'pending'
    },
    reference: {
      type: String,  // Order ID for refunds or payments
      default: null
    },
    description: {
      type: String
    },
    createdAt: {
      type: Date,
      default: Date.now
    },
    wallet: {
      balance: {
        type: Number,
        default: 0
      },
      lastUpdated: {
        type: Date,
        default: Date.now
      }
    }

  });

  module.exports = mongoose.model("WalletTransaction", WalletTransactionSchema);