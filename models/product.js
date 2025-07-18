const mongoose = require('mongoose');
const { Schema } = mongoose;

const productSchema = new Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true,
    trim: true
  },
  category: {
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Category',
    required: true,
  },
  brand: {
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Brand',
    required: true,
  },
  mainImage: {
    type: String,
    required: true
  },
  subImages: [String],
  isDeleted: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  isListed: {
    type: Boolean,
    default: true
  },
  variants: [
    {
      size: {
        type: String,
      },
      regularPrice: {
        type: Number,
        min: [0, "Regular price cannot be negative"],
      },
      discountedPrice:{
        type: Number,
        min:[0, "discount price cannot be negative"],
      },
      quantity: {
        type: Number,
        min: [0, "Quantity cannot be negative"],
      },
    },
  ],
  offer: {
    discountPercentage: {
      type: Number,
      min: [0, "Discount percentage cannot be negative"],
      max: [100, "Discount percentage cannot exceed 100"],
      default: 0
    }
  },
});

module.exports = mongoose.models.Product || mongoose.model('Product', productSchema);