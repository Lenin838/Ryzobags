const Product = require("../../models/product");
const Category = require('../../models/category');
const Brand = require('../../models/brand');
const mongoose = require('mongoose');
const Cart = require('../../models/cart');
const Wishlist = require('../../models/wishList'); 
const Address = require('../../models/address');
const crypto = require('crypto');
const Razorpay = require('razorpay');
const Coupon = require('../../models/coupon');
const Order = require('../../models/order');
const User = require("../../models/User");


const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

const restoreOrderStock = async (order) => {
  try{
    if(!order.items || order.items.length === 0) return;

    for(const item of order.items){
      await Product.updateOne(
        {_id: item.productId, "variants.size": item.size},
        {$inc: {"variants.$.quantity": item.quantity}}
      );
    }
    console.log("Stock restored for failed order:",order.orderId);
  }catch (error){
    console.error("Error restoring stock:",error);
  }
}


const productController = {
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
  
      if (req.query.minPrice || req.query.maxPrice) {
        const priceFilter = {};
        const minPrice = parseFloat(req.query.minPrice);
        const maxPrice = parseFloat(req.query.maxPrice);
        if (!isNaN(minPrice)) priceFilter.$gte = minPrice;
        if (!isNaN(maxPrice)) priceFilter.$lte = maxPrice;
        if (Object.keys(priceFilter).length > 0) {
          filter["variants.discountedPrice"] = priceFilter;
        }
      }
  
      const sortOption = req.query.sort || "";
      let sortConfig = {};
      switch (sortOption) {
        case "priceLowToHigh":
          sortConfig = { "variants.0.regularPrice": 1 };
        break;
        case "priceHighToLow":
          sortConfig = { "variants.0.regularPrice": -1 };
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

      const userId = req.session.user._id;        

      const wishlist = await Wishlist.findOne({userId})
        .populate("products");
      
      const newList = wishlist && wishlist.products 
        ? wishlist.products.map((product) => product.productId.toString())
        : [];
      
      console.log("Wishlist ", newList);
  
      const validProducts = products
      .filter((product) => product.variants && product.variants.length > 0)
      .map((product) => {
      const variants = product.variants.map((variant) => {
      const basePrice = variant.regularPrice;
      const productDiscount = product.offer?.discountPercentage || 0;
      const categoryDiscount = product.category?.offer?.discountPercentage || 0;
      const maxDiscount = Math.max(productDiscount, categoryDiscount);

      const discountedPrice = Math.round(basePrice - basePrice * (maxDiscount / 100));

      return {
        ...variant.toObject(),
        discountedPrice,
      };
    });

    return {
      ...product.toObject(),
      variants,
    };
  });

  
      const totalProducts = await Product.countDocuments(filter);
      const totalPages = Math.ceil(totalProducts / limit);
  
      const categories = await Category.find({ isActive: true });
      const brands = await Brand.find({ isActive: true });
  
      res.render("user/shopPage", {
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
        sortOption,
        minPrice: req.query.minPrice || "",
        maxPrice: req.query.maxPrice || "",
      });
      } catch (error) {
        console.error("Error loading shop page:", error);
        res.render("user/shopPage", {
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
          error: "Failed to load shop page. Please try again later.",
        });
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
            };
        });

        const stockPerVariant = product.variants.map((variant) => ({
            size: variant.size,
            hasStock: variant.quantity > 0,
        }));

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
                    };
                });

                return relatedProduct;
            });
        }

        const userId = req.session.user._id;
        const wishlist = await Wishlist.findOne({ userId })
            .populate("products");
        const newList = wishlist && wishlist.products
            ? wishlist.products.map((product) => product.productId.toString())
            : [];

        console.log("Wishlist ", newList);

        res.render("user/productView", {
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
        res.redirect("/user/shop");
    }
    },

    addToCart: async (req, res) => {
      try {
        const { id } = req.params;
        const { size, quantity = 1 } = req.body;
        const userId = req.session.user?._id;

        console.log('Received addToCart request:', { id, size, quantity, userId });

        if (!userId) {
          return res.status(401).json({ success: false, message: "User not authenticated" });
        }

        if (!mongoose.Types.ObjectId.isValid(id)) {
          return res.status(400).json({ success: false, message: "Invalid product ID" });
        }

        if (!size) {
          return res.status(400).json({ success: false, message: "Size is required" });
        }

        const parsedQuantity = parseInt(quantity);
        if (isNaN(parsedQuantity) || parsedQuantity <= 0 ) {
          return res.status(400).json({ success: false, message: "Quantity must be a positive number" });
        }

        const product = await Product.findById(id);
        if (!product || product.isDeleted || !product.isListed) {
          return res.status(404).json({ success: false, message: "Product not found or unavailable" });
        }

        const variant = product.variants.find((v) => v.size === size);
        if (!variant) {
          return res.status(400).json({ success: false, message: "Invalid size selected" });
        }

        if (variant.quantity < parsedQuantity) {
          return res.status(400).json({ success: false, message: `Only ${variant.quantity} items available in stock` });
        }

        await Wishlist.findOneAndUpdate(
          { userId: userId },
          { $pull: { products: { productId: id } } }
        );

        let cart = await Cart.findOne({ userId });
        if (!cart) {
          cart = new Cart({
            userId,
            items: [],
          });
        }

        const existingItem = cart.items.find(
          (item) => item.productId.toString() === id.toString() && item.size === size
        );

        if (existingItem) {
          const newQuantity = existingItem.quantity + parsedQuantity;
          if (newQuantity > 6) {
            return res.status(400).json({ success: false, message: "You can only add up to 6 units of this product" });
          }
          if (newQuantity > variant.quantity) {
            return res.status(400).json({ success: false, message: `Only ${variant.quantity} items available in stock` });
          }
          existingItem.quantity = newQuantity;
        } else {
          if (parsedQuantity > 6) {
            return res.status(400).json({ success: false, message: "You can only add up to 6 units of this product" });
          }
          cart.items.push({
            productId: id,
            size,
            quantity: parsedQuantity,
          });
        }

        await cart.save();
        return res.json({ success: true, message: "Product added to cart" });
      } catch (error) {
        console.error("Error adding to cart:", error.message);
        return res.status(500).json({ success: false, message: "Failed to add product to cart" });
      }
    },

    addToWishlist: async (req, res) => {
      try {
        const userId = req.session.user?._id;
        const productId = req.params.id;

        if (!userId) {
          return res.status(401).json({ success: false, message: "User not authenticated" });
        }

        if (!mongoose.Types.ObjectId.isValid(productId)) {
          return res.status(400).json({ success: false, message: "Invalid product ID" });
        }

        const product = await Product.findById(productId);
        if (!product || product.isDeleted || !product.isListed) {
          return res.status(404).json({ success: false, message: "Product not found or unavailable" });
        }

        const cart = await Cart.findOne({ userId });
        if (cart && cart.items.some(item => item.productId.toString() === productId.toString())) {
          return res.status(400).json({ success: false, message: "Product is already in your cart" });
        }

        const existingWishlist = await Wishlist.findOne({
          userId: userId,
          "products.productId": productId,
        });

        if (existingWishlist) {
          return res.status(400).json({ success: false, message: "Product is already in wishlist" });
        }

        await Wishlist.findOneAndUpdate(
          { userId: userId },
          {
            $push: {
              products: {
                productId: productId,
                addedOn: new Date(),
              },
            },
          },
          { upsert: true, new: true }
        );

        return res.status(200).json({ success: true, message: "Added to wishlist" });
      } catch (error) {
        console.error("Error adding to wishlist:", error.message);
        return res.status(500).json({ success: false, message: "Error adding to wishlist" });
      }
    },

    getWishlist: async (req, res) => {
      try {
        const userId = req.session.user._id;
    
        let wishlist = await Wishlist.findOne({ userId })
          .populate({
            path: "products.productId",
            match: { isDeleted: false, isListed: true },
            populate: [
              { path: "category", model: "Category" },
              { path: "brand", model: "Brand" },
            ],
          });
    
        if (!wishlist || !wishlist.products || wishlist.products.length === 0) {
          return res.render("user/wishlist", { wishlist: null, pageTitle: "Wishlist | RYZO BAGS" });
        }
    
        wishlist.products = wishlist.products.filter((product) => product.productId !== null);
    
        if (wishlist.products.length !== wishlist.__v) {
          await wishlist.save();
        }
    
        const wishlistData = {
          ...wishlist.toObject(),
          products: wishlist.products.map((item) => {
            const product = item.productId;
            const hasStock = product.variants.some((v) => v.quantity > 0);

            const productDiscount = product.offer?.discountPercentage || 0;
            const categoryDiscount = product.category?.offer?.discountPercentage || 0;
            const maxDiscount = Math.max(productDiscount, categoryDiscount);

            const variantsWithDiscount = product.variants.map((variant) => {
              const basePrice = variant.regularPrice;
              const discountedPrice = Math.round(basePrice - (basePrice * maxDiscount) / 100);
              return {
                ...variant,
                discountedPrice,
              };
            });

            return {
              ...item.toObject(),
              product: {
                ...product.toObject(),
                variants: variantsWithDiscount,
                maxDiscount,
              },
              hasStock,
            };
          }),
        };

    
        res.render("user/wishlist", { wishlist: wishlistData, pageTitle: "Wishlist | RYZO BAGS" });
      } catch (error) {
        console.error("Error loading wishlist:", error.message);
        res.render("user/wishlist", {
          wishlist: null,
          error: "Failed to load wishlist. Please try again later.",
          pageTitle: "Wishlist | RYZO BAGS",
        });
      }
    },

    checkWishlistCount: async (req, res) => {
    try {
      const userId = req.session.user?._id;
      if (!userId) {
        return res.status(401).json({ 
          success: false, 
          message: "User not authenticated" 
        });
      }

      const wishlist = await Wishlist.findOne({ 
        userId: new mongoose.Types.ObjectId(userId) 
      });
      
      const count = wishlist && wishlist.products ? wishlist.products.length : 0;
      
      console.log(`Wishlist count for user ${userId}:`, count);
      
      res.status(200).json({ success: true, count });
      
      } catch (error) {
        console.error("Error fetching wishlist count:", error);
        
        if (!res.headersSent) {
          res.status(500).json({ 
            success: false, 
            message: "Server error" 
          });
        }
      }
    },

    checkCartCount: async (req, res) => {
      try {
        const userId = req.session.user?._id;
        if (!userId) {
          return res.status(401).json({ 
            success: false, 
            message: "User not authenticated" 
          });
        }

        const cart = await Cart.findOne({ 
          userId: new mongoose.Types.ObjectId(userId) 
        });
        
        let count = 0;
        if (cart && cart.items) {
          count = cart.items.reduce((total, item) => {
            return total + (item.quantity || 1);
          }, 0);
        }
        
        console.log(`Cart count for user ${userId}:`, count);
        
        res.status(200).json({ success: true, count });
        
      } catch (error) {
        console.error("Error fetching cart count:", error);
        
        if (!res.headersSent) {
          res.status(500).json({ 
            success: false, 
            message: "Server error" 
          });
        }
      }
    },

    loadCart: async (req, res) => {
  try {
    const userId = req.session.user?._id;
    if (!userId) {
      return res.status(401).render("user/cart", {
        cart: { items: [] },
        error: "User not authenticated",
        hasOutOfStock: false,
        itemCount: 0,
        totalAmount: 0,
        totalSavings: 0,
        originalAmount: 0
      });
    }

    const cart = await Cart.findOne({ userId }).populate({
      path: "items.productId",
      match: { isDeleted: false, isListed: true },
      populate: [
        { path: "category", model: "Category" },
        { path: "brand", model: "Brand" },
      ],
    });

    if (!cart) {
      return res.render("user/cart", { 
        cart: { items: [] },
        hasOutOfStock: false,
        itemCount: 0,
        totalAmount: 0,
        totalSavings: 0,
        originalAmount: 0
      });
    }

    const initialLength = cart.items.length;
    cart.items = cart.items.filter((item) => item.productId !== null);

    if (cart.items.length !== initialLength) {
      await cart.save();
    }

    let totalAmount = 0;
    let originalAmount = 0;

    const cartData = {
      ...cart.toObject(),
      items: cart.items.map((item) => {
        const product = item.productId;
        const variant = product.variants.find((v) => v.size === item.size);
        const isValid = !!variant && variant.quantity >= item.quantity;
        
        const basePrice = variant?.regularPrice || 0;

        const productDiscount = product.offer?.discountPercentage || 0;
        const categoryDiscount = product.category?.offer?.discountPercentage || 0;
        const maxDiscount = Math.max(productDiscount, categoryDiscount);

        const finalPrice = Math.round(basePrice - (basePrice * maxDiscount / 100));
        const itemTotal = finalPrice * item.quantity;
        const itemOriginal = basePrice * item.quantity;

        console.log("finallllPrice...).....:",finalPrice);

        totalAmount += itemTotal;
        originalAmount += itemOriginal;

        return {
          ...item.toObject(),
          product,
          variant: variant || null,
          isValid,
          isOutOfStock: !isValid,
          finalPrice,
          maxDiscount,
          itemTotal,
          itemOriginal
        };
      }),
    };

    console.log("totalamt.....:",totalAmount);
    console.log("originalamt.......:",originalAmount);

    const itemCount = cartData.items.length;
    const hasOutOfStock = cartData.items.some(item => !item.isValid);
    const totalSavings = originalAmount - totalAmount;

    res.render("user/cart", { 
      cart: cartData,
      hasOutOfStock,
      itemCount,
      totalAmount,
      totalSavings,
      originalAmount
    });

  } catch (error) {
    console.error("Error loading cart:", error.message);
    res.status(500).render("user/cart", {
      cart: { items: [] },
      error: "Failed to load cart data. Please try again later.",
      hasOutOfStock: false,
      itemCount: 0,
      totalAmount: 0,
      totalSavings: 0,
      originalAmount: 0
    });
  }
    },

    deleteCartItem: async (req, res) => {
      try {
        const userId = req.session.user?._id;
        const productId = req.params.productId;

        if (!userId) {
          return res.status(401).json({ success: false, message: "User not authenticated" });
        }

        if (!mongoose.Types.ObjectId.isValid(productId)) {
          return res.status(400).json({ success: false, message: "Invalid product ID" });
        }

        const cart = await Cart.findOne({ userId });
        if (!cart) {
          return res.status(404).json({ success: false, message: "Cart not found" });
        }

        const initialLength = cart.items.length;
        cart.items = cart.items.filter((item) => item.productId.toString() !== productId.toString());

        if (cart.items.length === initialLength) {
          return res.status(404).json({ success: false, message: "Item not found in cart" });
        }

        await cart.save();
        return res.status(200).json({ success: true, message: "Item removed from cart" });
      } catch (error) {
        console.error("Error deleting cart item:", error.message);
        return res.status(500).json({ success: false, message: "Server error" });
      }
    },

    updateCartQuantity: async (req, res) => {
      try {
        const userId = req.session.user?._id;
        if (!userId) {
          return res.status(401).json({ success: false, message: "User not authenticated" });
        }

        const { productId, size, quantity } = req.body;
        console.log('Received updateCartQuantity request:', { productId, size, quantity });

        if (!productId || !size) {
          return res.status(400).json({ success: false, message: "Product ID and size are required" });
        }

        const parsedQuantity = parseInt(quantity);
        if (isNaN(parsedQuantity)) {
          return res.status(400).json({ success: false, message: "Quantity must be a valid number" });
        }

        const product = await Product.findById(productId);
        if (!product) {
          return res.status(404).json({ success: false, message: "Product not found" });
        }

        const cart = await Cart.findOne({ userId }).populate("items.productId");
        if (!cart) {
          return res.status(404).json({ success: false, message: "Cart not found" });
        }

        const itemIndex = cart.items.findIndex(
          (item) => item.productId._id.toString() === productId.toString() && item.size === size
        );

        if (itemIndex === -1) {
          return res.status(404).json({ success: false, message: "Item not found in cart" });
        }

        const item = cart.items[itemIndex];
        const variant = product.variants.find((v) => v.size === item.size);
        const stock = variant ? variant.quantity : 0;

        if (parsedQuantity < 1) {
          return res.status(400).json({ success: false, message: "Quantity must be at least 1" });
        }

        if (parsedQuantity > 6) {
          return res.status(400).json({ success: false, message: "Maximum quantity allowed is 6" });
        }

        if (parsedQuantity > stock) {
          return res.status(400).json({ success: false, message: `Only ${stock} items available in stock` });
        }

        cart.items[itemIndex].quantity = parsedQuantity;
        await cart.save();

        return res.status(200).json({
          success: true,
          message: "Cart updated successfully",
          updatedQuantity: parsedQuantity,
        });
      } catch (error) {
        console.error("Error updating cart quantity:", error);
        return res.status(500).json({ success: false, message: "Server error occurred while updating cart" });
      }
    },
    
    removeFromWishlist: async (req, res) => {
      console.log('=== removeFromWishlist controller called ===');
      try {
        const userId = req.session.user?._id;
        const productId = req.params.id;

        if (!userId) {
          return res.status(401).json({ 
            success: false, 
            message: "User not authenticated" 
          });
        }

        if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
          return res.status(400).json({ 
            success: false, 
            message: "Invalid product ID" 
          });
        }

        const result = await Wishlist.findOneAndUpdate(
          { 
            userId: userId,
            'products.productId': productId
          },
          { 
            $pull: { 
              products: { productId: productId }
            } 
          },
          { new: true }
        );

        if (!result) {
          return res.status(404).json({ 
            success: false, 
            message: "Product not found in wishlist" 
          });
        }

        return res.status(200).json({ 
          success: true, 
          message: "Product removed from wishlist successfully"
        });

      } catch (error) {
        console.error('Error in removeFromWishlist:', error);
        return res.status(500).json({ 
          success: false, 
          message: "Internal server error"
        });
      }
    },

    loadCheckout: async (req, res) => {
      try {
        const userId = req.session.user?._id;
        const email = req.session.user?.email;

        if (!userId || !email) {
          return res.redirect("/user/login?message=Please log in to proceed to checkout.");
        }

        const cart = await Cart.findOne({ userId }).populate({
          path: "items.productId",
          match: { isDeleted: false, isListed: true },
          populate: [
            { path: "category", model: "Category" },
            { path: "brand", model: "Brand" },
          ],
        });
        
        if (!cart || !cart.items || cart.items.length <= 0) {
          return res.redirect("/user/cart?message=Your cart is empty. Please add items before checkout.");
        }

        const user = await User.findOne({ email: email });
        
        const addressDoc = await Address.findOne({ userId });
        const addresses = addressDoc && addressDoc.address 
          ? addressDoc.address.filter((addr) => addr.status === "active")
          : [];

        const coupon = await Coupon.find({
          isActive: true,
          expiresAt: { $gt: new Date()},
          userId: {$ne: userId},
        });
        
        console.log("Available coupons:", coupon);
        
        const isReferredUser = !!user.referredBy;
        const isReferrer = await User.exists({referredBy: user._id});
        const referralCoupons = coupon.filter(c=> c.code.startsWith("RYZO"));
        const normalCoupons = coupon.filter(c => !c.code.startsWith("RYZO"));

        let finalCoupon = normalCoupons;
        if(isReferredUser || isReferrer){
          finalCoupon = [...normalCoupons,...referralCoupons];
        }

        let subtotal = 0;
        let totalProductDiscount = 0;

        const itemsWithStock = cart.items.map((item) => {
          const product = item.productId;
          const variant = product.variants.find((v) => v.size === item.size);

          const basePrice = variant?.regularPrice || 0;
          const productDiscount = product.offer?.discountPercentage || 0;
          const categoryDiscount = product.category?.offer?.discountPercentage || 0;
          const maxDiscount = Math.max(productDiscount, categoryDiscount);
          const discountedPrice = Math.round(basePrice - (basePrice * maxDiscount / 100));
          const discountAmount = basePrice - discountedPrice;

          console.log("finalPrice.....:", discountedPrice);
          const itemTotal = discountedPrice * item.quantity;
          subtotal += itemTotal;
          totalProductDiscount += discountAmount * item.quantity; 

          return {
            ...item.toObject(),
            product,
            variant: variant || null,
            finalPrice: discountedPrice,
            maxDiscount,
            itemTotal,
            hasStock: variant && variant.quantity >= item.quantity,
            discountAmountPerItem: discountAmount
          };
        });

        const outOfStockItems = itemsWithStock.filter((item) => !item.hasStock);
        const hasOutOfStock = outOfStockItems.length > 0;

        let couponDiscount = 0;
        let grandTotal = subtotal;
        
        if (req.session.checkoutData && req.session.checkoutData.couponId) {
          const couponDoc = await Coupon.findOne({ 
            _id: req.session.checkoutData.couponId, 
            isActive: true, 
            expiresAt: { $gt: new Date() },
            minCartAmount: { $lte: subtotal }
          });

          if (couponDoc) {
            if (couponDoc.discountType === 'percentage') {
              couponDiscount = Math.round((subtotal * couponDoc.discountAmount) / 100);
              if (couponDoc.maxDiscount && couponDiscount > couponDoc.maxDiscount) {
                couponDiscount = couponDoc.maxDiscount;
              }
            } else {
              couponDiscount = Math.min(couponDoc.discountAmount, subtotal);
            }
            
            grandTotal = subtotal - couponDiscount;
            
            req.session.checkoutData = {
              ...req.session.checkoutData,
              subtotal,
              couponDiscount,
              totalProductDiscount,
              grandTotal
            };
          } else {
            req.session.checkoutData = null;
          }
        }

        if (!req.session.checkoutData) {
          req.session.checkoutData = {
            subtotal,
            couponDiscount,
            totalProductDiscount,
            grandTotal,
            couponId: null
          };
        }

        res.render("user/checkout", {
          cart: { ...cart.toObject(), items: itemsWithStock },
          userAddress: addresses,
          subtotal,
          coupon: finalCoupon,
          productDiscount: totalProductDiscount,
          grandTotal,
          couponDiscount,
          user,
          product: itemsWithStock,
          hasOutOfStock
        });
      } catch (error) {
        console.error("Checkout Error:", error.message);
        res.redirect("/user/cart?message=An error occurred. Please try again.");
      }
    },

    placeOrder: async (req, res) => {
      let order = null;
      
      try {
        const userId = req.session.user?._id;
        const { addressId, payment, totalPrice, discount, coupon } = req.body;

        const validationErrors = [];
        
        if (!userId) validationErrors.push("User not authenticated");
        if (!addressId) validationErrors.push("Shipping address is required");
        if (!payment) validationErrors.push("Payment method is required");
        
        const validPaymentMethods = ["cod", "wallet", "razorpay"];
        if (!validPaymentMethods.includes(payment)) {
          validationErrors.push("Invalid payment method");
        }
        
        if (!totalPrice || isNaN(totalPrice)) {
          validationErrors.push("Invalid total price");
        }

        if (validationErrors.length > 0) {
          try {
            order = new Order({
              orderId: `RYZO-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
              userId: userId || null,
              paymentMethod: payment || 'unknown',
              address: addressId || null,
              items: [],
              totalAmount: totalPrice || 0,
              amountPaid: 0,
              discount: 0,
              paymentStatus: "failed",
              status: "failed",
              orderDate: new Date(),
              failureReason: validationErrors.join(', '),
              paymentFailureReason: "Validation failed"
            });
            
            await order.save();
            console.log("Failed order saved due to validation:", order.orderId);
          } catch (saveError) {
            console.error("Failed to save validation error order:", saveError);
          }
          
          return res.status(400).json({
            success: false,
            message: validationErrors[0]
          });
        }

        const userAddressDoc = await Address.findOne({ userId });
        if (!userAddressDoc) {
          order = new Order({
            orderId: `RYZO-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            userId,
            paymentMethod: payment,
            address: addressId,
            items: [],
            totalAmount: totalPrice,
            amountPaid: 0,
            discount: 0,
            paymentStatus: "failed",
            status: "failed",
            orderDate: new Date(),
            failureReason: "No addresses found for this user",
            paymentFailureReason: "Address validation failed"
          });
          await order.save();
          
          throw new Error("No addresses found for this user");
        }

        const selectedAddress = userAddressDoc.address.find(
          (addr) => addr._id.toString() === addressId && addr.status === "active"
        );
        
        if (!selectedAddress) {
          order = new Order({
            orderId: `RYZO-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            userId,
            paymentMethod: payment,
            address: addressId,
            items: [],
            totalAmount: totalPrice,
            amountPaid: 0,
            discount: 0,
            paymentStatus: "failed",
            status: "failed",
            orderDate: new Date(),
            failureReason: "Selected address not found or inactive",
            paymentFailureReason: "Address validation failed"
          });
          await order.save();
          
          throw new Error("Selected address not found or inactive");
        }

        const cart = await Cart.findOne({ userId }).populate({
          path: "items.productId",
          populate: [
            { path: "category", model: "Category" },
            { path: "brand", model: "Brand" },
          ],
        });
        
        if (!cart || cart.items.length === 0) {
          order = new Order({
            orderId: `RYZO-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            userId,
            paymentMethod: payment,
            address: addressId,
            items: [],
            totalAmount: totalPrice,
            amountPaid: 0,
            discount: 0,
            paymentStatus: "failed",
            status: "failed",
            orderDate: new Date(),
            failureReason: "Cannot place empty order",
            paymentFailureReason: "Cart validation failed"
          });
          await order.save();
          
          throw new Error("Cannot place empty order");
        }

        let totalAmount = 0;
        const items = [];
        
        for (const item of cart.items) {
          const product = item.productId;
          const variant = product.variants.find((v) => v.size === item.size);
          
          if (!variant) {
            order = new Order({
              orderId: `RYZO-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
              userId,
              paymentMethod: payment,
              address: addressId,
              items: items,
              totalAmount: totalAmount,
              amountPaid: 0,
              discount: 0,
              paymentStatus: "failed",
              status: "failed",
              orderDate: new Date(),
              failureReason: `Size ${item.size} not available for ${product.name}`,
              paymentFailureReason: "Product validation failed"
            });
            await order.save();
            
            throw new Error(`Size ${item.size} not available for ${product.name}`);
          }
          
          if (variant.quantity < item.quantity) {
            order = new Order({
              orderId: `RYZO-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
              userId,
              paymentMethod: payment,
              address: addressId,
              items: items,
              totalAmount: totalAmount,
              amountPaid: 0,
              discount: 0,
              paymentStatus: "failed",
              status: "failed",
              orderDate: new Date(),
              failureReason: `Only ${variant.quantity} left in stock for ${product.name}`,
              paymentFailureReason: "Stock validation failed"
            });
            await order.save();
            
            throw new Error(`Only ${variant.quantity} left in stock for ${product.name}`);
          }

          const basePrice = variant.regularPrice;
          const productDiscount = product.offer?.discountPercentage || 0;
          const categoryDiscount = product.category?.offer?.discountPercentage || 0;
          const maxDiscount = Math.max(productDiscount, categoryDiscount);
          const finalPrice = Math.round(basePrice - (basePrice * maxDiscount / 100));
          const itemTotal = finalPrice * item.quantity;
          totalAmount += itemTotal;

          items.push({
            productId: product._id,
            size: item.size,
            quantity: item.quantity,
            itemSalePrice: finalPrice,
            status: payment === "razorpay" ? "failed" : "pending",
            });
        }

        let calculatedCouponDiscount = 0;
        let couponId = null;
        
        if (req.session.checkoutData && req.session.checkoutData.couponId) {
          const couponDoc = await Coupon.findOne({ 
            _id: req.session.checkoutData.couponId, 
            isActive: true, 
            expiresAt: { $gt: new Date() },
            minCartAmount: { $lte: totalAmount }
          });

          if (couponDoc) {
            const ordersWithCoupon = await Order.countDocuments({ 
              userId, 
              couponId: couponDoc._id,
              status: { $in: ['delivered', 'shipped'] }
            });
            
            if (ordersWithCoupon >= couponDoc.usageLimit) {
              order = new Order({
                orderId: `RYZO-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                userId,
                paymentMethod: payment,
                address: addressId,
                items: items,
                totalAmount: totalAmount,
                amountPaid: 0,
                discount: 0,
                couponId: couponDoc._id,
                paymentStatus: "failed",
                status: "failed",
                orderDate: new Date(),
                failureReason: "Coupon usage limit exceeded",
                paymentFailureReason: "Coupon validation failed"
              });
              await order.save();
              
              throw new Error("Coupon usage limit exceeded");
            }
            if (couponDoc.discountType === 'percentage') {
              calculatedCouponDiscount = Math.round((totalAmount * couponDoc.discountAmount) / 100);
              if (couponDoc.maxDiscount && calculatedCouponDiscount > couponDoc.maxDiscount) {
                calculatedCouponDiscount = couponDoc.maxDiscount;
              }
            } else {
              calculatedCouponDiscount = Math.min(couponDoc.discountAmount, totalAmount);
            }

            couponId = couponDoc._id;

            if (!couponDoc.userId.includes(userId)) {
              await Coupon.updateOne(
                { _id: couponDoc._id },
                { $addToSet: { userId } }
              );
            }
          } else {
            order = new Order({
              orderId: `RYZO-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
              userId,
              paymentMethod: payment,
              address: addressId,
              items: items,
              totalAmount: totalAmount,
              amountPaid: 0,
              discount: 0,
              paymentStatus: "failed",
              status: "failed",
              orderDate: new Date(),
              failureReason: "Invalid or expired coupon",
              paymentFailureReason: "Coupon validation failed"
            });
            await order.save();
            
            throw new Error("Invalid or expired coupon");
          }
        }

        const calculatedTotal = Math.round((totalAmount - calculatedCouponDiscount) * 100) / 100;

        order = new Order({
          orderId: `RYZO-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          userId,
          paymentMethod: payment,
          address: addressId,
          items,
          totalAmount: calculatedTotal,
          amountPaid: payment === "cod" ? 0 : calculatedTotal,
          discount: calculatedCouponDiscount,
          couponId,
          paymentStatus: payment === "cod" ? "pending" : "pending",
          status: payment === "razorpay" ? "failed" : "pending",
          orderDate: new Date(),
        });

        await order.save();

        for (const item of cart.items) {
          const variant = item.productId.variants.find((v) => v.size === item.size);
          variant.quantity -= item.quantity;
          await Product.updateOne(
            { _id: item.productId._id, "variants.size": item.size },
            { $set: { "variants.$.quantity": variant.quantity } }
          );
        }

        await Cart.deleteOne({ userId });
        req.session.checkoutData = null;

        if (payment === "cod") {
          order.paymentStatus = "pending";
          order.status = "processing"; 
          await order.save();
          return res.status(200).json({
            success: true,
            order: { _id: order._id },
            message: "COD order placed successfully",
          });
        } 
        else if (payment === "wallet") {
          const user = await User.findById(userId);
          if (user.walletBalance < calculatedTotal) {
            order.paymentStatus = "failed";
            order.status = "failed";
            order.failureReason = "Insufficient wallet balance";
            order.paymentFailureReason = "Insufficient wallet balance";
            await order.save();
            
            return res.status(400).json({
              success: false,
              message: "Insufficient wallet balance",
            });
          }
          user.walletBalance -= calculatedTotal;
          await user.save();
          order.paymentStatus = "completed";
          order.status = "processing";
          order.amountPaid = calculatedTotal;
          order.isPaymentVerified = true;
          await order.save();
          return res.status(200).json({
            success: true,
            order: { _id: order._id },
            message: "Wallet order placed successfully",
          });
        } 
        else if (payment === "razorpay") {
          const razorpayOrder = await razorpay.orders.create({
            amount: calculatedTotal * 100,
            currency: "INR",
            receipt: `order_${order._id}`,
          });
          order.transactionId = razorpayOrder.id;
          await order.save();
          return res.status(200).json({
            success: true,
            order: { _id: order._id },
            mongoOrderId: order._id,
            key_id: process.env.RAZORPAY_KEY_ID,
            order_id: razorpayOrder.id,
            message: "Razorpay order created",
          });
        } 
        else {
          order.paymentStatus = "failed";
          order.status = "failed";
          order.failureReason = "Invalid payment method";
          order.paymentFailureReason = "Invalid payment method";
          await order.save();
          
          throw new Error("Invalid payment method");
        }
        
      } catch (err) {
        console.error("Order Error:", err.message);
        if (order && order._id) {
          try {
            await Order.findByIdAndUpdate(order._id, {
              paymentStatus: "failed",
              status: "failed",
              failureReason: err.message,
              paymentFailureReason: err.message,
              updatedAt: new Date()
            });
            console.log("Updated existing order to failed status:", order.orderId);
          } catch (updateError) {
            console.error("Failed to update order to failed status:", updateError);
          }
        }
        
        res.status(500).json({
          success: false,
          message: err.message || "Failed to process order",
        });
      }
    },

    paymentConfirm: async (req,res) => {
      try{
        const {orderId,status} = req.body;

        if(!mongoose.Types.ObjectId.isValid(orderId)){
          return res.status(400).json({success: false, message: "Invalid order ID"});
        }

        if(!["pending","completed","failed"].includes(status)){
          return res.status(400).json({success: false, message: "Invalid status"});
        }

        const order = await Order.findById(orderId);
        if(!order){
          return res.status(404).json({success: false, message:"order not found"});
        }

        const updateData = {
          paymentStatus: status,
          updatedAt: new Date(),
        };

        if(status === "failed"){
          updateData.status = "failed";
          updateData.failureReason = "Payment confirmation failed";
          updateData.paymentFailureReason = "Payment confirmation failed";
          updateData.paymentFailureDate = new Date();

          await restoreOrderStock(order);
        }else if(status === "completed"){
          updateData.status = "processing";
          updateData.isPaymentVerified = true;
          updateData.paymentDate = new Date();
          updateData.amountPaid = order.totalAmount;
        }

        await Order.findByIdAndUpdate(orderId, updateData);
        res.status(200).json({success: true, message: "Payment updated"});
      }catch (err){
        console.error("Error updating Payment:",err);
        res.status(500).json({success: false,message:"Error updating payment"});
      }
    },

    paymentFailure: async (req,res) => {
      try{
        const {orderId,razorpay_order_id,error_code,error_description} = req.body;

        console.log("Payment failure reported:",{
          orderId,
          razorpayOrderId: razorpay_order_id,
          errorCode: error_code,
          errorDescription: error_description
        });

        let order;
        if(mongoose.Types.ObjectId.isValid(orderId)){
          order = await Order.findById(orderId);
        }else if(razorpay_order_id){
          order = await Order.findOne({transactionId: razorpay_order_id});
        }

        if(!order){
          console.error("Order not found for failure:",{
            orderId,razorpay_order_id
          });
          return res.status(404).json({success: false,message:"Order not found"});
        }

        order.paymentStatus = "failed";
        order.status = "failed";
        order.paymentFailureReason = error_description || `Payment failed with code: ${error_code}`;
        order.failureReason = "Payment was not completed by user";
        order.paymentAttempts = (order.paymentAttempts || 0) + 1;
        order.lastPaymentAttempt = new Date();
        order.paymentFailureDate = new Date();

        order.failureMetadata = {
          errorCode: error_code,
          errorDescription: error_description,
          failureType: 'payment_failure',
          timeStamp: new Date(),
        };

        await order.save();

        await restoreOrderStock(order);

        console.log("Order marked as failed:",{
          orderId: order.orderId,
          reason: order.paymentFailureReason
        });

        res.status(200).json({success: true, message:"Payment failure recorded",orderId: order.orderId});
      }catch (err){
        console.error("Error handling payment failure:",err);
        res.status(500).json({
          success: false,
          message: "Failed to record payment failure"
        });
      }
    },

    verifyPayment: async (req,res) => {
      try{
        const {razorpay_payment_id,razorpay_order_id,razorpay_signature,error} = req.body;

        console.log("Payment verification started:",{
          paymentId: razorpay_payment_id,
          orderId: razorpay_order_id,
          hasSignature: !!razorpay_signature,
          hasError: !!error
        });

        if(error){
          console.log("Payment failed on Razorpay side:",error);

          const order = await Order.findOne({transactionId: razorpay_order_id});

          if(order){
            order.paymentStatus = "failed",
            order.status = "failed",
            order.paymentFailureReason = error.description || "Payment failed",
            order.failureReason = "Payment failed on gateway";
            order.paymentAttempts = (order.paymentAttempts || 0) + 1;
            order.lastPaymentAttempt = new Date();
            order.paymentFailureDate = new Date();

            order.failureMetadata = {
              errorCode: error.code,
              errorDescription: error.description,
              failureType: 'gateway_error',
              timeStamp: new Date(),
            };
            await order.save();

            await restoreOrderStock(order);

            return res.status(400).json({
              success:false,
              message: error.description || "payment failed",
              orderId: order.orderId
            });
          }

          return res.status(400).json({
            success: false,
            message: "Payment failed"
          });
        }

        if(!razorpay_payment_id || !razorpay_order_id || !razorpay_signature){
          console.error("Missing Razorpay payment details:",{
            paymentId: !!razorpay_payment_id,
            orderId: !!razorpay_order_id,
            signature: !!razorpay_signature,
            body: req.body
          });

          return res.status(400).json({
            success: false,
            message: "Missing payment details"
          });
        }

        const order = await Order.findOne({transactionId: razorpay_order_id});
        if(!order){
          console.error("Order not found for transactionId:",razorpay_order_id);
          return res.status(404).json({success: false,message: "Order not found"});
        }
        order.paymentAttempts = (order.paymentAttempts || 0) + 1;
        order.lastPaymentAttempt = new Date();


        if(order.isPaymentVerified && order.paymentStatus === "completed"){
          console.log("Payment already verified for Order:",order._id);
          return res.status(200).json({
            success: true,
            order: {_id: order._id},
            message: "Payment already verified",
            alreadyProcessed: true
          });
        }

        const body = razorpay_order_id+"|"+razorpay_payment_id;
        const expectedSignature = crypto
        .createHmac("sha256",process.env.RAZORPAY_KEY_SECRET)
        .update(body.toString())
        .digest("hex");

        console.log("Signature verification:",{
          expected: expectedSignature,
          received: razorpay_signature,
          match: expectedSignature === razorpay_signature
        });

        if(expectedSignature !== razorpay_signature){
          order.paymentStatus = "failed",
          order.status = "failed",
          order.paymentFailureReason = "Invalid payment signature - possible tampering";
          order.failureReason = "Payment signature verification failed";
          order.verificationAttempts = (order.verificationAttempts || 0) + 1;
          order.paymentFailureDate = new Date();


          order.failureMetadata = {
            errorCode: 'SIGNATURE_MISMATCH',
            errorDescription: "Payment signature verification failed",
            failureType: "signature_verification_failed",
            timeStamp: new Date(),
            expectedSignature: expectedSignature,
            receivedSignature: razorpay_signature
          };

          await order.save();

          await restoreOrderStock(order);

          console.error("Invalid Razorpay signature:",{
            expected: expectedSignature,
            received: razorpay_signature,
            orderId: order._id
          });

          return res.status(400).json({success: false, message: "Invalid payment signature",orderId: order.orderId});
        }

        order.items.forEach(item => {
        item.status = "processing"; 
        });

        order.paymentStatus = "completed";
        order.status = "processing";
        order.amountPaid = order.totalAmount;
        order.razorpayPaymentId = razorpay_payment_id;
        order.razorpaySignature = razorpay_signature;
        order.paymentDate = new Date();
        order.isPaymentVerified = true;
        order.verificationDate = new Date();
        order.verificationAttempts = (order.verificationAttempts || 0) + 1;
        order.paymentFailureReason = undefined;
        order.failureReason = undefined;
        order.failureMetadata = undefined;

        await order.save();

        console.log("Payment verified successfully:",{
          orderId: order.orderId,
          paymentId: razorpay_payment_id,
          amount: order.totalAmount,
          attempts: order.paymentAttempts
        });

        res.status(200).json({
          success: true,
          order: {_id: order.orderId},
          message: "Payment verified successfully",
        });
      }catch (err){
        console.error("Error verifying payment :",{
          message: err.message,
          stack: err.stack,
          body: req.body
        });

        try{
          if(req.body.razorpay_order_id){
            const order = await Order.findOne({transactionId: req.body.razorpay_order_id});
            if(order){
              order.paymentStatus = "failed";
              order.status = "failed";
              order.paymentFailureReason = `Server error during verification: ${err.message}`;
              order.failureReason = "Internal server error during payment verification";
              order.verificationAttempts = (order.verificationAttempts || 0) + 1;
              order.paymentFailureDate = new Date();

              order.failureMetadata = {
                errorCode: "SERVER_ERROR",
                errorDescription: err.message,
                failureType: "server_error",
                timeStamp: new Date(),
              };

              await order.save();

              await restoreOrderStock(order);
            }
          }
        }catch (updateErr){
          console.error("Failed to update order with error: ",updateErr.message);
        }

        res.status(500).json({
          success: false,
          message: "Payment verification failed due to server error"
        });
      }
    },

    retryPayment: async (req,res) => {
      try{
        const { orderId } = req.params;
        const userId = req.session.user?._id;

        const objectId = mongoose.Types.ObjectId.isValid(orderId) ? new mongoose.Types.ObjectId(orderId) : null;
        if (!objectId) {
          return res.status(400).json({ success: false, message: "Invalid order ID" });
        }

        if(!userId){
          return res.status(401).json({success: false, message: "User not authenticated"});
        }

        console.log("Retry Payment - orderId:", orderId);
        console.log("User ID:", userId);
        


        const order = await Order.findOne({
          _id: orderId, 
          userId,
          paymentMethod: "razorpay",
          $or: [
            { paymentStatus: "failed" },
            { paymentStatus: "pending", status: "failed" }
          ]
        });


      console.log("Matched Order:", order);

        if(!order){
          return res.status(404).json({
            success: false,
            message: "Failed order not found or not eligible for retry"
          });
        }

        for(const item of order.items){
          const product = await Product.findById(item.productId);
          if(!product){
            return res.status(400).json({
              success: false,
              message: `Product ${item.productId} is no longer available`
            });
          }

          const variant = product.variants.find(v=>v.size === item.size);
          if(!variant){
            return res.status(400).json({
              success: false,
              message: `Size ${item.size} is no longer available for ${product.name}`
            });
          }

          if(variant.quantity < item.quantity){
            return res.status(400).json({
              success: false,
              message: `Insufficient stock for ${product.name} (${item.size}).Only ${variant.quantity} available`
            });
          }
        }

        if(order.paymentMethod === "wallet"){
          const user = await User.findById(userId);
          if(user.walletBalance < order.totalAmount){
            return res.status(400).json({
              success: false,
              message: "Insufficient wallet balance"
            });
          }
        }


        const shortId = order._id.toString().slice(-8);
        const timeStamp = Date.now().toString().slice(-6);
        const razorpayOrder = await razorpay.orders.create({
          amount: order.totalAmount * 100,
          currency: "INR",
          receipt: `retry_${shortId}_${timeStamp}`,
        });

        order.transactionId = razorpayOrder.id;
        order.paymentStatus = "pending";
        order.status = "pending";
        order.paymentAttempts = (order.paymentAttempts || 0) + 1;
        order.lastPaymentAttempt = new Date();
        order.paymentFailureReason = undefined;
        order.failureReason = undefined;
        order.failureMetadata = undefined;
        order.retryAttempts = (order.retryAttempts || 0) + 1;
        order.lastRetryDate = new Date();

        await order.save();

        for(const item of order.items){
          const product = await Product.findById(item.productId);
          const variant = product.variants.find(v => v.size === item.size);
          variant.quantity -= item.quantity;

          await Product.updateOne(
            {_id: product._id, "variants.size": item.size},
            {$set: {"variants.$.quantity": variant.quantity}}
          );
        }

        console.log("Payment retry initiated",{
          orderId: order.orderId,
          razorpayOrderId: razorpayOrder.id,
          amount: order.totalAmount,
          attempts: order.paymentAttempts
        });

        res.status(200).json({
          success: true,
          order: {_id: order._id},
          mongoOrderId: order._id,
          key_id: process.env.RAZORPAY_KEY_ID,
          order_id: razorpayOrder.id,
          amount: order.totalAmount,
          message: "Payment retry initiated"
        });
      }catch (err){
        console.error("Error retrying payment: ",err);
        res.status(500).json({
          success: false,
          message: "Failed to retry payment"
        });
      }
    },

    orderSuccess: async (req,res) => {
      try{
        const orderId = req.query.orderId;
        console.log("orderId:",orderId);
        res.render('user/orderSuccess',{
          orderId
        });
      }catch(error){
        console.log("Error in order sucess Page:",error);
      }
    },

    orderFailure: async (req, res) => {
      try {
        const { orderId, error } = req.query;
        console.log("ordsamnvvv:",orderId)
        res.render('user/orderFailure', {
          orderId: orderId || '',
          error: error || 'Payment failed. Please try again.'
        });
      } catch (err) {
        console.error("Error rendering failure page:", err);
        res.status(500).send("Internal Server Error");
      }
    },

    applyCoupon: async (req,res) => {
      try{
        const {coupon,total} = req.body;
        const userId = req.session.user?._id;

        if(!userId){
          return res.status(401).json({success:false, message: "user not authenticated"});
        }

        const subtotal = parseFloat(total);
        if(isNaN(subtotal)){
          return res.status(400).json({success: false, message:"Invalid total amount"});
        }

        const couponDoc = await Coupon.findOne({code: coupon.trim().toUpperCase()});

        if(!couponDoc){
          return res.status(400).json({success: false,message:"coupon not found" });
        }

        if(!couponDoc.isActive){
          return res.status(400).json({success:false,message:"coupon is not active"});
        }

        if(couponDoc.expiresAt < new Date()){
          return res.status(400).json({success:false,message:"Coupon has expired"});
        }

        if(subtotal < couponDoc.minCartAmount){
          return res.status(400).json({success:false,message: `Minimum cart amount of ₹${couponDoc.minCartAmount} required`});
        }

        const ordersWithCoupon = await Order.countDocuments({
          userId,
          couponId: couponDoc._id,
          status:{$in: ["delivered","shipped"]}
        });

        if(ordersWithCoupon > couponDoc.usageLimit ){
          return res.status(400).json({success:false,
            message: "you have already used this coupon maximum times"
          });
        }

        if(couponDoc.userId && couponDoc.userId.length > 0){
          const isUserAllowed = couponDoc.userId.includes(userId);

          if(!isUserAllowed){
            return res.status(400).json({success: false,
              message: "This coupon is not available for your account"
            });
          }
        }

        let discount = 0;
        if(couponDoc.discountType === "percentage"){
          discount = Math.round((subtotal*couponDoc.discountAmount)/100)
          if(couponDoc.maxDiscount && discount > couponDoc.maxDiscount){
            discount = couponDoc.maxDiscount;
          }
        }else{
          discount = Math.min(couponDoc.discountAmount,subtotal);
        }

        const existingCheckoutData = req.session.checkoutData || {};
        const totalProductDiscount = existingCheckoutData.totalProductDiscount || 0;

        const grandTotal = subtotal - discount;

        req.session.checkoutData = {
          ...existingCheckoutData,
          subtotal: subtotal,
          couponDiscount: discount,
          totalProductDiscount: totalProductDiscount,
          grandTotal,
          couponId: couponDoc._id,
          couponCode: coupon.trim().toUpperCase()
        };

        res.status(200).json({
          success: true,
          discount,
          grandTotal,
          couponId: couponDoc._id,
          message: "coupon applied successfully",
        })
      } catch (err) {
        console.error("Error applying coupon:",err);
        res.status(500).json({success: false, message: "Failed to  apply coupon:"+err.message});
      }
    }
};

module.exports = productController;