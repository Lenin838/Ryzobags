const Product = require("../../models/product");
const Category = require('../../models/category');
const Brand = require('../../models/brand');
const mongoose = require('mongoose');
const Cart = require('../../models/cart');
const Wishlist = require('../../models/wishList'); 
const Address = require('../../models/address');
const Order = require('../../models/order');
const User = require("../../models/User");

const productController = {
  loadShopPage: async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = 12;
      const skip = (page - 1) * limit;
  
      const searchQuery = req.query.search?.trim() || "";
      const filter = { isDeleted: false, isListed: true };
  
      if (searchQuery) {
        const sanitizedQuery = searchQuery.replace(/[$^<>{}[\]\\/]/g, ""); // Basic sanitization
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
          filter["variants.regularPrice"] = priceFilter;
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
  
      const validProducts = products.filter(
        (product) => product.variants && product.variants.length > 0
      );
  
      const totalProducts = await Product.countDocuments(filter);
      const totalPages = Math.ceil(totalProducts / limit);
  
      const categories = await Category.find({ isActive: true });
      const brands = await Brand.find({ isActive: true });
  
      res.render("user/shopPage", {
        products: validProducts,
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
      }
  
      res.render("user/productView", {
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
      if (isNaN(parsedQuantity) || parsedQuantity <= 0) {
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

      // Check if the product is in the wishlist and remove it if present
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

      // Check if the product is already in the user's cart
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
          return {
            ...item.toObject(),
            product,
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
        return res.status(401).json({ success: false, message: "User not authenticated" });
      }

      // Simple approach - find the wishlist and count products
      const wishlist = await Wishlist.findOne({ userId: new mongoose.Types.ObjectId(userId) });
      const count = wishlist && wishlist.products ? wishlist.products.length : 0;
      
      console.log(`Wishlist count for user ${userId}:`, count); // Debug log
      return res.status(200).json({ success: true, count });
    } catch (error) {
      console.error("Error fetching wishlist count:", error);
      return res.status(500).json({ success: false, message: "Server error" });
    }
  },

  checkCartCount: async (req, res) => {
    try {
      const userId = req.session.user?._id;
      if (!userId) {
        return res.status(401).json({ success: false, message: "User not authenticated" });
      }

      const cart = await Cart.findOne({ userId: new mongoose.Types.ObjectId(userId) });
      
      // Count total quantity of items, not just number of different products
      let count = 0;
      if (cart && cart.items) {
        count = cart.items.reduce((total, item) => {
          return total + (item.quantity || 1); // Use quantity if available, otherwise count as 1
        }, 0);
      }
      
      console.log(`Cart count for user ${userId}:`, count); // Debug log
      return res.status(200).json({ success: true, count });
    } catch (error) {
      console.error("Error fetching cart count:", error);
      return res.status(500).json({ success: false, message: "Server error" });
    }
  },

  loadCart: async (req, res) => {
    try {
      const userId = req.session.user?._id;
      if (!userId) {
        return res.status(401).render("user/cart", {
          cart: { items: [] },
          error: "User not authenticated",
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
        return res.render("user/cart", { cart: { items: [] } });
      }

      const initialLength = cart.items.length;
      cart.items = cart.items.filter((item) => item.productId !== null);

      if (cart.items.length !== initialLength) {
        await cart.save();
      }

      const cartData = {
        ...cart.toObject(),
        items: cart.items.map((item) => {
          const product = item.productId;
          const variant = product.variants.find((v) => v.size === item.size);
          return {
            ...item.toObject(),
            product,
            variant: variant || null,
            isValid: !!variant && variant.quantity >= item.quantity,
          };
        }),
      };

      res.render("user/cart", { cart: cartData });
    } catch (error) {
      console.error("Error loading cart:", error.message);
      res.status(500).render("user/cart", {
        cart: { items: [] },
        error: "Failed to load cart data. Please try again later.",
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
    try {
      const userId = req.session.user?._id;
      const productId = req.params.id;

      if (!userId) {
        return res.status(401).json({ success: false, message: "User not authenticated" });
      }

      if (!mongoose.Types.ObjectId.isValid(productId)) {
        return res.status(400).json({ success: false, message: "Invalid product ID" });
      }

      await Wishlist.findOneAndUpdate(
        { userId: userId },
        { $pull: { products: { productId: productId } } }
      );

      return res.status(200).json({ success: true, message: "Removed from wishlist" });
    } catch (error) {
      console.error("Error removing from wishlist:", error.message);
      return res.status(500).json({ success: false, message: "Error removing from wishlist" });
    }
  },

  loadCheckout: async (req, res) => {
    try {
      const userId = req.session.user?._id;
      const email = req.session.user?.email;

      if (!userId || !email) {
        return res.redirect("/user/login?message=Please log in to proceed to checkout.");
      }

      const cart = await Cart.findOne({ userId }).populate("items.productId");
      if (!cart || !cart.items || cart.items.length <= 0) {
        return res.redirect("/user/cart?message=Your cart is empty. Please add items before checkout.");
      }

      const user = await User.findOne({ email: email });
      const addressDoc = await Address.findOne({ userId });

      let userAddress = [];
      if (addressDoc && addressDoc.address) {
        userAddress = addressDoc.address.filter((addr) => addr.isDefault === "true" || !addr.isDefault);
      }

      let subtotal = 0;
      const itemsWithStock = cart.items.map((item) => {
        const product = item.productId;
        const variant = product.variants.find((v) => v.size === item.size);
        const itemTotal = variant ? variant.regularPrice * item.quantity : 0;
        subtotal += itemTotal;

        return {
          ...item.toObject(),
          product,
          variant,
          hasStock: variant && variant.quantity >= item.quantity,
        };
      });

      const outOfStockItems = itemsWithStock.filter((item) => !item.hasStock);
      if (outOfStockItems.length > 0) {
        return res.redirect("/user/cart?message=Some items are out of stock. Please update your cart.");
      }

      let discount = 0;
      if (subtotal > 2000) {
        discount = Math.floor(subtotal * 0.10);
      }

      let shipping = 0;
      if (subtotal < 1000) {
        shipping = 40;
      }

      const grandTotal = subtotal + shipping - discount;

      res.render("user/checkout", {
        cart: { ...cart.toObject(), items: itemsWithStock },
        userAddress,
        subtotal,
        discount,
        grandTotal,
        shipping,
        user,
        product: itemsWithStock,
      });
    } catch (error) {
      console.error("Checkout Error:", error.message);
      res.redirect("/user/cart?message=An error occurred. Please try again.");
    }
  },

  placeOrder: async (req, res) => {
    try {
      const userId = req.session.user?._id;
      const { addressId, payment } = req.body;
  
      if (!userId) {
        throw new Error("User not authenticated");
      }
  
      if (!addressId) {
        throw new Error("Shipping address is required");
      }
  
      if (!payment) {
        throw new Error("Payment method is required");
      }
  
      const userAddressDoc = await Address.findOne({ userId });
      if (!userAddressDoc) {
        throw new Error("No addresses found for this user");
      }
  
      const selectedAddress = userAddressDoc.address.find(
        (addr) => addr._id.toString() === addressId
      );
      if (!selectedAddress) {
        throw new Error("Selected address not found");
      }
  
      const cart = await Cart.findOne({ userId }).populate("items.productId");
      if (!cart || cart.items.length === 0) {
        throw new Error("Cannot place empty order");
      }
  
      let totalAmount = 0;
      const items = cart.items.map((item) => {
        const variant = item.productId.variants.find((v) => v.size === item.size);
        if (!variant) throw new Error(`Size ${item.size} not available for ${item.productId.name}`);
        if (variant.quantity < item.quantity) throw new Error(`Only ${variant.quantity} left in stock for ${item.productId.name}`);
  
        const itemTotal = variant.regularPrice * item.quantity;
        totalAmount += itemTotal;
  
        return {
          productId: item.productId._id,
          size: item.size,
          quantity: item.quantity,
          itemSalePrice: variant.regularPrice,
          itemStatus: "pending",
        };
      });
  
      for (const item of cart.items) {
        const variant = item.productId.variants.find((v) => v.size === item.size);
        variant.quantity -= item.quantity;
        await Product.updateOne(
          { _id: item.productId._id, "variants.size": item.size },
          { $set: { "variants.$.quantity": variant.quantity } }
        );
      }
  
      const order = new Order({
        orderId: `ORDER-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        userId,
        paymentMethod: payment,
        address: addressId,
        items,
        totalAmount,
        paymentStatus: payment === "cod" ? "pending" : "pending",
        status: "pending",
        orderDate: new Date(),
      });
  
      await order.save();
      await Cart.deleteOne({ userId });
  
      res.status(200).json({
        success: true,
        orderId: order.orderId,
        total: order.totalAmount,
        message: `${payment.toUpperCase()} order placed successfully.`,
        order: { _id: order._id },
      });
    } catch (err) {
      console.error("Order Error:", err.message);
      res.status(500).json({
        success: false,
        message: err.message || "Failed to process order",
      });
    }
  },

  verifyPayment: async (req, res) => {
    try {
      res.status(200).json({ status: true });
    } catch (err) {
      console.error("Error verifying payment:", err);
      res.status(500).json({ status: false, message: "Payment verification failed" });
    }
  },
  
  paymentConfirm: async (req, res) => {
    try {
      const { orderId, status } = req.body;
  
      if (!mongoose.Types.ObjectId.isValid(orderId)) {
        return res.status(400).json({ success: false, message: "Invalid order ID" });
      }
  
      if (!["pending", "completed", "failed"].includes(status)) {
        return res.status(400).json({ success: false, message: "Invalid status" });
      }
  
      await Order.findByIdAndUpdate(orderId, { paymentStatus: status });
      res.status(200).json({ success: true, message: "Payment updated" });
    } catch (err) {
      console.error("Error updating payment:", err);
      res.status(500).json({ success: false, message: "Error updating payment" });
    }
  },

  postAddAddress: async (req, res) => {
    try {
      const userId = req.session.user?._id;
      if (!userId) {
        return res.redirect("/user/login?message=Please log in to add an address.");
      }
  
      const { name, phone, altPhone, city, state, pincode, landMark, addressType } = req.body;
  
      if (!name || !phone || !city || !state || !pincode) {
        return res.redirect("/user/checkout?message=All required address fields must be provided.");
      }
  
      if (!/^\d{10}$/.test(phone) || (altPhone && !/^\d{10}$/.test(altPhone))) {
        return res.redirect("/user/checkout?message=Phone numbers must be 10 digits.");
      }
  
      if (!/^\d{6}$/.test(pincode)) {
        return res.redirect("/user/checkout?message=Pincode must be 6 digits.");
      }
  
      const newAddress = {
        name,
        phone,
        altPhone: altPhone || "",
        city,
        state,
        pincode,
        landMark: landMark || "",
        addressType,
        status: "active",
      };
  
      let userAddress = await Address.findOne({ userId });
      if (userAddress) {
        userAddress.address.push(newAddress);
        await userAddress.save();
      } else {
        userAddress = await Address.create({ userId, address: [newAddress] });
      }
  
      res.redirect("/user/checkout");
    } catch (err) {
      console.error("Error adding address:", err.message);
      res.redirect("/user/checkout?message=Failed to add address. Please try again.");
    }
  },

  orderSuccess: (req, res) => {
    res.render("user/orderSuccess");
  },

  getAddAddress: (req, res) => {
    res.render('user/addAddress');
  },

  getEditAddress: async (req, res) => {
    try {
      const addressId = req.query.id;
      const userId = req.session.user._id;
  
      const userAddress = await Address.findOne({ userId });
  
      if (!userAddress || !userAddress.address || userAddress.address.length === 0) {
        return res.redirect('/user/checkout');
      }
  
      const targetAddress = userAddress.address.find(a => a._id.toString() === addressId);
  
      if (!targetAddress) {
        return res.redirect('/user/checkout');
      }
  
      res.render('user/editAddress', { address: targetAddress, addressId });
    } catch (err) {
      console.error(err.message);
      res.redirect('/user/checkout');
    }
  },
  
  postEditAddress: async (req, res) => {
    try {
      const addressId = req.body.addressId;
      const userId = req.session.user._id;
  
      await Address.updateOne(
        { userId, "address._id": addressId },
        {
          $set: {
            "address.$.name": req.body.name,
            "address.$.phone": req.body.phone,
            "address.$.altPhone": req.body.altPhone,
            "address.$.city": req.body.city,
            "address.$.state": req.body.state,
            "address.$.pincode": req.body.pincode,
            "address.$.landMark": req.body.landMark,
            "address.$.addressType": req.body.addressType,
          }
        }
      );
  
      res.redirect('/user/checkout');
    } catch (err) {
      console.error(err.message);
      res.redirect('/user/checkout');
    }
  },
  
  deleteAddress: async (req, res) => {
    try {
      const addressId = req.query.id;
      const userId = req.session.user._id;

      await Address.updateOne(
        { userId, "address._id": addressId },
        { $set: { "address.$.status": "inactive" } }
      );

      res.redirect('/user/checkout');
    } catch (err) {
      console.error(err.message);
      res.redirect('/user/checkout');
    }
  }
};

module.exports = productController;