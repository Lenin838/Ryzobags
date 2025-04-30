const express = require('express');
const userProductRouter = express.Router();
const productController = require('../../controllers/users/productController');
const { isAuthenticated } = require('../../middlewares/auth');

userProductRouter.get('/shop', isAuthenticated, productController.loadShopPage);
userProductRouter.get('/productView/:id', isAuthenticated, productController.loadProductView);

module.exports = userProductRouter;
