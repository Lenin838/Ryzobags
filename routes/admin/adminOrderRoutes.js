const express = require('express');
const adminOrderRouter = express.Router();
const adminOrderController = require('../../controllers/admins/orderController');
const { isAdminLoggedIn } = require('../../middlewares/adminAuth');

// Order Management Routes
adminOrderRouter.get('/orders', isAdminLoggedIn, adminOrderController.getOrders);
adminOrderRouter.get('/orders/view/:orderId', isAdminLoggedIn, adminOrderController.viewOrder);
adminOrderRouter.post('/orders/update-status/:orderId', isAdminLoggedIn, adminOrderController.updateOrderStatus);
adminOrderRouter.post('/orders/verify-return/:orderId', isAdminLoggedIn, adminOrderController.verifyReturnRequest);

module.exports = adminOrderRouter;