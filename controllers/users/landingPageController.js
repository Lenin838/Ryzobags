const express = require('express');
const mongoose = require('mongoose');
const Product = require('../../models/product');
const Category = require('../../models/category');
const Brand = require('../../models/brand');
const Wishlist = require('../../models/wishList');


const landingController = {
    getLandingPage: async (req,res) => {
        try {
                const products = await Product.find({ isDeleted: false, isListed: true })
                    .populate("category brand")
                    .limit(4);
                const categories = await Category.find({ isActive: true });
                const brands = await Brand.find({ isActive: true });
        
                const validProducts = products
                    .filter((product) => product.variants && product.variants.length > 0)
                    .map((product) => {
                        const variants = product.variants.map((variant) => {
                            const basePrice = variant.regularPrice;
                            const productDiscount = product.offer?.discountPercentage || 0;
                            const categoryDiscount = product.category?.offer?.discountPercentage || 0;
                            const maxDiscount = Math.max(productDiscount, categoryDiscount);
                            const discountedPrice = Math.round(
                                basePrice - basePrice * (maxDiscount / 100)
                            );
                            return {
                            ...variant.toObject(),
                            regularPrice: basePrice,
                            discountedPrice,
                            maxDiscount,
                        };
                    });
                    const firstVariant = variants[0];
                    const basePrice = firstVariant.regularPrice;
                    const productDiscount = product.offer?.discountPercentage || 0;
                    const categoryDiscount = product.category?.offer?.discountPercentage || 0;
                    const maxDiscount = Math.max(productDiscount, categoryDiscount);
                    const discountedPrice = Math.round(
                        basePrice - basePrice * (maxDiscount / 100)
                    );
        
                    return {
                    ...product.toObject(),
                    variants,
                    variantPrice: basePrice,
                    discountedPrice: discountedPrice,
                    maxDiscount: maxDiscount,
                };
            });
        
            res.render("landing", {
                products: validProducts,
                categories,
                brands,
            });
        } catch (error) {
            console.error("Error loading homepage:", error.message);
            res.status(500).send("Internal Server Error");
        }
        
    },

    loadProductView: async (req, res) => {
        try {
            const productId = req.params.id;
    
            if (!mongoose.Types.ObjectId.isValid(productId)) {
                req.flash("error", "Invalid product ID");
                return res.redirect("/user/shop");
            }
    
            const product = await Product.findById(productId)
                .populate("category brand")
                .lean();
    
            if (!product || product.isDeleted || !product.isListed) {
                req.flash("error", "Product is unavailable or no longer exists");
                return res.redirect("/user/shop");
            }
    
            const productDiscount = product.offer?.discountPercentage || 0;
            const categoryDiscount = product.category?.offer?.discountPercentage || 0;
            const maxDiscount = Math.max(productDiscount, categoryDiscount);
    
            product.variants = product.variants.map((variant) => {
                const basePrice = variant.regularPrice;
                const discountedPrice = Math.round(basePrice - (basePrice * maxDiscount) / 100);
                return {
                    ...variant,
                    discountedPrice,
                    hasStock: variant.quantity > 0,
                    stockCount: variant.quantity
                };
            });
    
    
            const stockPerVariant = product.variants.map((variant) => ({
                size: variant.size,
                hasStock: variant.quantity > 0,
                quantity: variant.quantity,
                stockStatus: variant.quantity === 0?'out-of-stock':variant.quantity < 5?'low-stock':'in-stock'
            }));
    
            const totalStock = product.variants.reduce((total,variant)=>total+variant.quantity,0);
            const hasAnyStock = product.variants.some(variant => variant.quantity > 0);
            const isCompletelyOutOfStock = totalStock === 0;
    
            product.totalStock = totalStock
            product.hasAnyStock = hasAnyStock
            product.isOutOfStock = isCompletelyOutOfStock
            product.stockPerVariant = stockPerVariant
    
            let relatedProducts = [];
            if (product.category) {
                relatedProducts = await Product.find({
                    category: product.category._id,
                    _id: { $ne: product._id },
                    isDeleted: false,
                    isListed: true,
                })
                    .limit(4)
                    .lean();
    
                relatedProducts = relatedProducts.map((relatedProduct) => {
                    const productDiscount = relatedProduct.offer?.discountPercentage || 0;
                    const categoryDiscount = relatedProduct.category?.offer?.discountPercentage || 0;
                    const maxDiscount = Math.max(productDiscount, categoryDiscount);
    
                    relatedProduct.variants = relatedProduct.variants.map((variant) => {
                        const basePrice = variant.regularPrice;
                        const discountedPrice = Math.round(basePrice - (basePrice * maxDiscount) / 100);
                        return {
                            ...variant,
                            discountedPrice,
                            hasStock: variant.quantity > 0,
                            stockCount: variant.quantity
                        };
                    });
    
                    const totalStock = relatedProduct.variants.reduce((total,variant)=>total+variant.quantity,0);
                    const hasAnyStock = relatedProduct.variants.some(variant => variant.quantity>0);
    
                    relatedProduct.totalStock = totalStock;
                    relatedProduct.hasAnyStock = hasAnyStock;
                    relatedProduct.isOutOfStock = totalStock === 0;
    
                    return relatedProduct;
                });
            }
    
            const userId = req.session.user_id;
            const wishlist = await Wishlist.findOne({ userId })
                .populate("products");
            const newList = wishlist && wishlist.products
                ? wishlist.products.map((product) => product.productId.toString())
                : [];
    
    
            res.render("productViews", {
                wishlist: newList,
                product,
                relatedProducts,
                stockPerVariant,
                user: req.session.user || null,
                pageTitle: `${product.name} | RYZO BAGS`,
            });
        } catch (error) {
            console.error("Error in product details page:", error);
            req.flash("error", "Failed to load product details");
            res.redirect("/shop");
        }
    },

    loadShopPage: async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 6;
    const skip = (page - 1) * limit;

    const searchQuery = req.query.search?.trim() || "";
    const filter = { isDeleted: false, isListed: true };

    if (searchQuery) {
      const sanitizedQuery = searchQuery.replace(/[$^<>{}[\]\\/]/g, ""); 
      filter.$or = [
        { name: { $regex: sanitizedQuery, $options: "i" } },
        { description: { $regex: sanitizedQuery, $options: "i" } },
      ];
    }

    if (req.query.category) {
      const selectedCategoryNames = Array.isArray(req.query.category)
        ? req.query.category
        : [req.query.category];
      if (selectedCategoryNames.length > 0) {
        const categoryDocs = await Category.find({
          name: { $in: selectedCategoryNames },
          isActive: true,
        });
        const selectedCategories = categoryDocs.map((category) => category._id);
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
          isActive: true,
        });
        const selectedBrands = brandDocs.map((brand) => brand._id);
        if (selectedBrands.length > 0) {
          filter.brand = { $in: selectedBrands };
        }
      }
    }

    const minPrice = req.query.minPrice ? parseFloat(req.query.minPrice) : null;
    const maxPrice = req.query.maxPrice ? parseFloat(req.query.maxPrice) : null;
    const hasPriceFilter = (minPrice !== null && !isNaN(minPrice)) || (maxPrice !== null && !isNaN(maxPrice));

    if (hasPriceFilter) {
      const priceFilter = {};
      if (minPrice !== null && !isNaN(minPrice)) priceFilter.$gte = minPrice;
      if (maxPrice !== null && !isNaN(maxPrice)) priceFilter.$lte = maxPrice;
      
      filter.$or = filter.$or || [];
      filter.$or.push(
        { "variants.discountedPrice": priceFilter },
        { "variants.regularPrice": priceFilter }
      );
    }

    const sortOption = req.query.sort || "";
    let sortConfig = {};
    switch (sortOption) {
      case "priceLowToHigh":
        sortConfig = { "variants.0.discountedPrice": 1 };
        break;
      case "priceHighToLow":
        sortConfig = { "variants.0.discountedPrice": -1 };
        break;
      case "nameAToZ":
        sortConfig = { name: 1 };
        break;
      case "nameZToA":
        sortConfig = { name: -1 };
        break;
      default:
        sortConfig = { createdAt: -1 };
    }

    const products = await Product.find(filter)
      .populate("category brand")
      .sort(sortConfig)
      .skip(skip)
      .limit(limit);

    const totalProducts = await Product.countDocuments(filter);
    const totalPages = Math.ceil(totalProducts / limit);

    // Handle wishlist - only if user is logged in
    let newList = [];
    if (req.session && req.session.user && req.session.user._id) {
      const userId = req.session.user._id;        
      const wishlist = await Wishlist.findOne({userId}).populate("products");
      
      newList = wishlist && wishlist.products 
        ? wishlist.products.map((product) => product.productId.toString())
        : [];
    }

    let validProducts = products
      .filter((product) => product.variants && product.variants.length > 0)
      .map((product) => {
        const variants = product.variants.map((variant) => {
          const basePrice = variant.regularPrice;
          const productDiscount = product.offer?.discountPercentage || 0;
          const categoryDiscount = product.category?.offer?.discountPercentage || 0;
          const maxDiscount = Math.max(productDiscount, categoryDiscount);

          let discountedPrice = variant.discountedPrice;
          if (!discountedPrice && maxDiscount > 0) {
            discountedPrice = Math.round(basePrice - basePrice * (maxDiscount / 100));
          } else if (!discountedPrice) {
            discountedPrice = basePrice;
          }

          return {
            ...variant.toObject(),
            discountedPrice,
            hasStock: variant.quantity > 0,
            stockCount: variant.quantity
          };
        });

        const totalStock = variants.reduce((total,variant)=>total+variant.quantity,0);
        const hasAnyStock = variants.some(variant => variant.quantity > 0);

        const stockPerSize = variants.map(variant => ({
          size: variant.size,
          hasStock: variant.quantity > 0,
          quantity: variant.quantity
        }));

        return {
          ...product.toObject(),
          variants,
          totalStock,
          hasAnyStock,
          stockPerSize,
          isOutOfStock: totalStock === 0
        };
      });

    if (hasPriceFilter) {
      validProducts = validProducts.filter(product => {
        return product.variants.some(variant => {
          const price = variant.discountedPrice || variant.regularPrice;
          const minCheck = minPrice === null || isNaN(minPrice) || price >= minPrice;
          const maxCheck = maxPrice === null || isNaN(maxPrice) || price <= maxPrice;
          return minCheck && maxCheck;
        });
      });
    }

    validProducts.forEach(product => {
      const prices = product.variants.map(v => v.discountedPrice || v.regularPrice);
      
      if (hasPriceFilter) {
        const inRange = product.variants.some(variant => {
          const price = variant.discountedPrice || variant.regularPrice;
          const minCheck = minPrice === null || isNaN(minPrice) || price >= minPrice;
          const maxCheck = maxPrice === null || isNaN(maxPrice) || price <= maxPrice;
          return minCheck && maxCheck;
        });
      }
    });

    const categories = await Category.find({ isActive: true });
    const brands = await Brand.find({ isActive: true });

    res.render("shopPages", {
      products: validProducts,
      wishlist: newList,
      categories,
      brands,
      currentPage: page,
      totalPages,
      search: searchQuery,
      selectedCategories: req.query.category
        ? Array.isArray(req.query.category)
          ? req.query.category
          : [req.query.category]
        : [],
      selectedBrands: req.query.brand
        ? Array.isArray(req.query.brand)
          ? req.query.brand
          : [req.query.brand]
        : [],
      sortOption: req.query.sort || "",
      minPrice: req.query.minPrice || "",
      maxPrice: req.query.maxPrice || "",
      isUserLoggedIn: !!(req.session && req.session.user && req.session.user._id) // Pass login status to template
    });
  } catch (error) {
    console.error("Error loading shop page:", error);
    res.render("shopPages", {
      products: [],
      wishlist: [],
      categories: [],
      brands: [],
      currentPage: 1,
      totalPages: 1,
      search: "",
      selectedCategories: [],
      selectedBrands: [],
      sortOption: "",
      minPrice: "",
      maxPrice: "",
      isUserLoggedIn: false,
      error: "Failed to load shop page. Please try again later.",
    });
  }
},
}

module.exports = landingController;