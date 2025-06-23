const express = require('express');
const userProductRouter = express.Router();
const productController = require('../../controllers/users/productController');
const { isAuthenticated } = require('../../middlewares/auth');

userProductRouter.get('/shop', isAuthenticated, productController.loadShopPage);
userProductRouter.get('/productView/:id', isAuthenticated, productController.loadProductView);
userProductRouter.post('/addtoCart/:id', productController.addToCart);
userProductRouter.post('/addtoWishlist/:id', productController.addToWishlist);
userProductRouter.get('/cart', isAuthenticated, productController.loadCart);
userProductRouter.get('/wishlist', isAuthenticated, productController.getWishlist);
userProductRouter.get('/wishlist/count', isAuthenticated, productController.checkWishlistCount);
userProductRouter.get('/cart/count', isAuthenticated, productController.checkCartCount);
userProductRouter.post('/removeFromWishlist/:id', isAuthenticated, productController.removeFromWishlist);
userProductRouter.put('/updateCartQuantity', isAuthenticated, productController.updateCartQuantity);
userProductRouter.delete('/deleteCart/:productId', isAuthenticated, productController.deleteCartItem);
userProductRouter.get('/checkout', isAuthenticated, productController.loadCheckout);
userProductRouter.post('/orderPlaced', isAuthenticated, productController.placeOrder);
userProductRouter.post('/verifyPayment', isAuthenticated, productController.verifyPayment);
userProductRouter.post('/paymentConfirm', isAuthenticated, productController.paymentConfirm);
userProductRouter.get('/orderSuccess', isAuthenticated, productController.orderSuccess);
userProductRouter.get('/addAddress', isAuthenticated, productController.getAddAddress);
userProductRouter.post('/addAddress', isAuthenticated, productController.postAddAddress);
userProductRouter.get('/editAddress', isAuthenticated, productController.getEditAddress);
userProductRouter.post('/editAddress', isAuthenticated, productController.postEditAddress);
userProductRouter.get('/deleteAddress', isAuthenticated, productController.deleteAddress);

module.exports = userProductRouter;