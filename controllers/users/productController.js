const Product = require("../../models/product");
const Category = require('../../models/category');
const Brand = require('../../models/brand');
const mongoose = require('mongoose');

const productController = {
    loadShopPage: async (req, res) => {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = 12; 
            const skip = (page - 1) * limit;
    
            const searchQuery = req.query.search || "";
            const filter = { isDeleted: false, isListed: true };
    
            if (searchQuery) {
                filter.$or = [
                    { name: { $regex: searchQuery, $options: 'i' } },
                    { description: { $regex: searchQuery, $options: 'i' } }
                ];
            }
    
            if (req.query.category) {
                const selectedCategoryNames = Array.isArray(req.query.category)
                    ? req.query.category
                    : [req.query.category];
    
                if (selectedCategoryNames.length > 0) {
                    const categoryDocs = await Category.find({
                        name: { $in: selectedCategoryNames },
                        isActive: true 
                    });
    
                    const selectedCategories = categoryDocs.map(category => category._id);
    
                    if (selectedCategories.length > 0) {
                        filter.category = { $in: selectedCategories };
                    }
                }
            }
    
            if (req.query.brand) {
                const selectedBrandNames = Array.isArray(req.query.brand)
                    ? req.query.brand
                    : [req.query.brand];
    
                if (selectedBrandNames.length > 0) {
                    const brandDocs = await Brand.find({
                        name: { $in: selectedBrandNames },
                        isActive: true  
                    });
                    
                    const selectedBrands = brandDocs.map(brand => brand._id);
    
                    if (selectedBrands.length > 0) {
                        filter.brand = { $in: selectedBrands };
                    }
                }
            }
    
            if (req.query.minPrice || req.query.maxPrice) {
                const priceFilter = {};
                
                if (req.query.minPrice) {
                    priceFilter.$gte = parseFloat(req.query.minPrice);
                }
                
                if (req.query.maxPrice) {
                    priceFilter.$lte = parseFloat(req.query.maxPrice);
                }
                
                if (Object.keys(priceFilter).length > 0) {
                    filter['variants.regularPrice'] = priceFilter;
                }
            }
    
            const sortOption = req.query.sort || "";
            let sortConfig = {};
            
            switch (sortOption) {
                case 'priceLowToHigh':
                    sortConfig = { 'variants.0.regularPrice': 1 };
                    break;
    
                case 'priceHighToLow':
                    sortConfig = { 'variants.0.regularPrice': -1 };
                    break;
    
                case 'nameAToZ':
                    sortConfig = { name: 1 };
                    break;
    
                case 'nameZToA':
                    sortConfig = { name: -1 };
                    break;
    
                default:
                    sortConfig = { createdAt: -1 };
            }
    
            const products = await Product.find(filter)
                .sort(sortConfig)
                .skip(skip)
                .limit(limit);
    
            const totalProducts = await Product.countDocuments(filter);
            const totalPages = Math.ceil(totalProducts / limit);
    
            const categories = await Category.find({ isActive: true });
            const brands = await Brand.find({ isActive: true });
    
            res.render('user/shopPage', {
                products,
                categories,
                brands,
                currentPage: page,
                totalPages,
                search: searchQuery,
                selectedCategories: req.query.category ? (Array.isArray(req.query.category) ? req.query.category : [req.query.category]) : [],
                selectedBrands: req.query.brand ? (Array.isArray(req.query.brand) ? req.query.brand : [req.query.brand]) : [],
                sortOption,
                minPrice: req.query.minPrice || '',
                maxPrice: req.query.maxPrice || '',
            });
        } catch (error) {
            console.error('Error loading loadShop: ', error);
            res.status(500).send('Internal server error');
        }
    },

    loadProductView: async (req, res) => {
        try {
            const productId = req.params.id;

            if (!mongoose.Types.ObjectId.isValid(productId)) {
                req.flash('error', 'Invalid product ID');
                return res.redirect('/user/shop');
            }

            const product = await Product.findById(productId).populate('category');
            
            if (!product || product.isDeleted || !product.isListed) {
                req.flash('error', 'Product is unavailable or no longer exists');
                return res.redirect('/user/shop');
            }

            const hasStock = product.variants.some(variant => variant.quantity > 0);
            
            let relatedProducts = [];
            if (product.category) {
                relatedProducts = await Product.find({
                    category: product.category._id,
                    _id: { $ne: product._id },
                    isDeleted: false,
                    isListed: true
                })
                .limit(4)
                .lean();
            }

            console.log("product",product)

            res.render('user/productView', {
                product,
                relatedProducts,
                hasStock,
                user: req.session.user || null,
                pageTitle: `${product.name} | RYZO BAGS`
            });

        } catch (error) {
            console.error('Error in product details page:', error);
            req.flash('error', 'Failed to load product details');
            res.redirect('/user/shop');
        }
    },

    addToCart: async (req, res) => {
        try {
          const productId = req.params.id;
          const { size, variantIndex } = req.body;
          
          // Ensure the product exists and is available
          const product = await Product.findOne({
            _id: productId,
            isDeleted: false, 
            isListed: true
          });
          
          if (!product) {
            return res.status(404).json({
              success: false,
              message: "Product not found or unavailable"
            });
          }
          
          // Check if the variant exists
          if (!product.variants[variantIndex]) {
            return res.status(400).json({
              success: false,
              message: "Selected variant not found"
            });
          }
          
          // Here you would usually have cart logic to add the product
          // For now we'll just return success
          
          return res.status(200).json({
            success: true,
            message: "Product added to cart successfully"
          });
          
        } catch (error) {
          console.error("Error adding to cart:", error);
          return res.status(500).json({
            success: false,
            message: "Internal server error"
          });
        }
      },

      addToWishlist: async (req, res) => {
        try {
          const productId = req.params.id;
          
          // Check if product exists and is available
          const product = await Product.findOne({
            _id: productId,
            isDeleted: false,
            isListed: true
          });
          
          if (!product) {
            return res.status(404).json({
              success: false,
              message: "Product not found or unavailable"
            });
          }
          
          // Here you would usually have wishlist logic
          // For now we'll just return success
          
          return res.status(200).json({
            success: true,
            message: "Product added to wishlist"
          });
          
        } catch (error) {
          console.error("Error adding to wishlist:", error);
          return res.status(500).json({
            success: false,
            message: "Internal server error"
          });
        }
      }
    };
    
    module.exports = productController;
    