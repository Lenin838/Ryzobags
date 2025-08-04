const express = require('express');
const orderRouter = express.Router();
const orderController = require('../../controllers/users/orderController');
const { isAuthenticated } = require('../../middlewares/auth');
const { globalLimiter } = require('../../middlewares/rateLimiter');

orderRouter.get('/orderDetails/:id', isAuthenticated,globalLimiter, orderController.getOrderDetails);
orderRouter.patch('/orders/cancel', isAuthenticated,globalLimiter, orderController.cancelOrder);
orderRouter.patch('/orders/cancel-item', isAuthenticated, globalLimiter,orderController.cancelOrderItem);
orderRouter.patch('/orders/return-item', isAuthenticated,globalLimiter, orderController.returnOrderItem);
orderRouter.patch('/orders/return-entire-order', isAuthenticated,globalLimiter, orderController.returnEntireOrder); 
orderRouter.get('/ordersDetails/:id/invoice', isAuthenticated, globalLimiter,orderController.downloadInvoice);

orderRouter.get('/wallet/balance', isAuthenticated, globalLimiter,orderController.getWalletBalance);
orderRouter.get('/wallet/transactions', isAuthenticated, globalLimiter,orderController.getWalletTransactions);

module.exports = orderRouter;