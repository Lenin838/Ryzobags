const express = require('express');
const userProductRouter = express.Router();
const productController = require('../../controllers/users/productController');
const { isAuthenticated } = require('../../middlewares/auth');
const {paymentLimiter,couponLimiter,globalLimiter} = require('../../middlewares/rateLimiter');

userProductRouter.get('/shop', isAuthenticated,globalLimiter, productController.loadShopPage);
userProductRouter.get('/productView/:id', isAuthenticated, globalLimiter,productController.loadProductView);
userProductRouter.post('/addtoCart/:id',isAuthenticated,globalLimiter, productController.addToCart);
userProductRouter.post('/addtoWishlist/:id',isAuthenticated,globalLimiter, productController.addToWishlist);
userProductRouter.get('/cart', isAuthenticated,globalLimiter, productController.loadCart);
userProductRouter.get('/wishlist', isAuthenticated,globalLimiter, productController.getWishlist);
userProductRouter.get('/wishlist/count', isAuthenticated,globalLimiter, productController.checkWishlistCount);
userProductRouter.get('/cart/count', isAuthenticated, globalLimiter,productController.checkCartCount);
userProductRouter.delete('/removeFromWishlist/:id', isAuthenticated,globalLimiter, productController.removeFromWishlist);
userProductRouter.put('/updateCartQuantity', isAuthenticated,globalLimiter, productController.updateCartQuantity);
userProductRouter.delete('/deleteCart/:productId', isAuthenticated,globalLimiter, productController.deleteCartItem);
userProductRouter.get('/checkout', isAuthenticated,globalLimiter, productController.loadCheckout);
userProductRouter.post('/checkout', isAuthenticated,globalLimiter, productController.loadCheckout);
userProductRouter.post('/orderPlaced', paymentLimiter,isAuthenticated, productController.placeOrder);
userProductRouter.post('/verify-payment', paymentLimiter,isAuthenticated, productController.verifyPayment);
userProductRouter.get('/orderSuccess', isAuthenticated,globalLimiter, productController.orderSuccess);
userProductRouter.get('/orderFailure',isAuthenticated,globalLimiter,productController.orderFailure);
userProductRouter.post('/applyCoupon',couponLimiter,isAuthenticated,productController.applyCoupon);
userProductRouter.put('/payment-failure',isAuthenticated,globalLimiter, productController.paymentFailure);
userProductRouter.put('/retry-payment/:orderId', isAuthenticated,globalLimiter,productController.retryPayment);

module.exports = userProductRouter;