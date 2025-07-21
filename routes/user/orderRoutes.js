const express = require('express');
const orderRouter = express.Router();
const orderController = require('../../controllers/users/orderController');
const { isAuthenticated } = require('../../middlewares/auth');

orderRouter.get('/orderDetails/:id', isAuthenticated, orderController.getOrderDetails);
orderRouter.patch('/orders/cancel', isAuthenticated, orderController.cancelOrder);
orderRouter.patch('/orders/cancel-item', isAuthenticated, orderController.cancelOrderItem);
orderRouter.patch('/orders/return-item', isAuthenticated, orderController.returnOrderItem);
orderRouter.patch('/orders/return-entire-order', isAuthenticated, orderController.returnEntireOrder); 
orderRouter.get('/ordersDetails/:id/invoice', isAuthenticated, orderController.downloadInvoice);

orderRouter.get('/wallet/balance', isAuthenticated, orderController.getWalletBalance);
orderRouter.get('/wallet/transactions', isAuthenticated, orderController.getWalletTransactions);

module.exports = orderRouter;