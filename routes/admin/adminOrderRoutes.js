const express = require('express');
const adminOrderRouter = express.Router();
const adminOrderController = require('../../controllers/admins/orderController');
const { isAdminLoggedIn } = require('../../middlewares/adminAuth');

adminOrderRouter.get('/orders', isAdminLoggedIn, adminOrderController.getOrders);
adminOrderRouter.get('/orders/view/:orderId', isAdminLoggedIn, adminOrderController.viewOrder);
adminOrderRouter.put('/orders/update-status/:orderId', isAdminLoggedIn, adminOrderController.updateOrderStatus);
adminOrderRouter.patch('/orders/verify-return/:orderId', isAdminLoggedIn, adminOrderController.verifyReturnRequest);

module.exports = adminOrderRouter;