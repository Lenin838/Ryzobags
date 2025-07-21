const express = require('express');
const adminInventoryRouter = express.Router();
const adminInventoryController = require('../../controllers/admins/adminInventoryController');
const { isAdminLoggedIn } = require('../../middlewares/adminAuth');

adminInventoryRouter.get('/inventory', isAdminLoggedIn, adminInventoryController.getInventory);
adminInventoryRouter.put('/inventory/update/:id', isAdminLoggedIn, adminInventoryController.updateStock);

module.exports = adminInventoryRouter;