const Product = require('../../models/product');
const statusCode = require('../../config/statusCode');
const message = require('../../config/messages');

const adminInventoryController = {
  getInventory: async (req, res) => {
    try {
      const { search = '', page = 1 } = req.query;
      const limit = 2;
      const skip = (page - 1) * limit;
      const lowStockThreshold = 5;

      let query = { isDeleted: false };
      if (search) {
        query.$or = [
          { name: { $regex: search, $options: 'i' } },
          { 'variants.size': { $regex: search, $options: 'i' } },
        ];
      }

      const products = await Product.find(query)
        .populate('category', 'name')
        .populate('brand', 'name')
        .sort({ name: 1 })
        .skip(skip)
        .limit(limit)
        .lean();

      const totalProducts = await Product.countDocuments(query);
      const totalPages = Math.ceil(totalProducts / limit);

      products.forEach((product) => {
        product.variants.forEach((variant) => {
          variant.isLowStock = variant.quantity <= lowStockThreshold;
        });
      });

      res.render('admin/layout', {
        body: 'inventory',
        products,
        currentPage: parseInt(page),
        totalPages,
        totalProducts,
        searchQuery: search,
        lowStockThreshold,
        success: req.flash('success'),
        error: req.flash('error'),
        csrfToken: req.csrfToken ? req.csrfToken() : '',
      });
    } catch (err) {
      console.error('Error in getInventory:', err);
      req.flash('error', 'Unable to load inventory');
      res.status(statusCode.INTERNAL_SERVER_ERROR).render('admin/inventory', {
        products: [],
        currentPage: 1,
        totalPages: 0,
        totalProducts: 0,
        searchQuery: '',
        lowStockThreshold: 10,
        error: req.flash('error'),
        csrfToken: '',
      });
    }
  },

  updateStock: async (req, res) => {
    try {
      const { id } = req.params;
      const { size, quantity } = req.body;

      if (!size || isNaN(quantity) || quantity < 0) {
        return res.status(statusCode.BAD_REQUEST).json({ message: message.UPDATE_STOCK_INVALID });
      }

      const product = await Product.findById(id);
      if (!product || product.isDeleted) {
        return res.status(statusCode.NOT_FOUND).json({ message: message.PRODUCT_NOT_FOUND });
      }

      const variant = product.variants.find((v) => v.size === size);
      if (!variant) {
        return res.status(statusCode.NOT_FOUND).json({ message: message.UPDATE_STOCK_VARIANT_NOT_FOUND });
      }

      variant.quantity = parseInt(quantity);
      await product.save();

      return res.json({ message: `Quantity updated to ${quantity} for ${product.name} (Size: ${size})` });
    } catch (err) {
      console.error('Error in updateStock:', err);
      return res.status(statusCode.INTERNAL_SERVER_ERROR).json({ message:message.UPDATE_STOCK_FAILED });
    }
  },
};

module.exports = adminInventoryController;