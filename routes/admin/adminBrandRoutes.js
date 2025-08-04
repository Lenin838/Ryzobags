const express = require('express');
const brandRouter = express.Router();
const brandController = require('../../controllers/admins/brandController');
const { isAdminLoggedIn } = require('../../middlewares/adminAuth');



brandRouter.get('/brands',isAdminLoggedIn,brandController.getBrandList);
brandRouter.get('/brands/add',isAdminLoggedIn,brandController.getAddBrand);
brandRouter.post('/brands/add',isAdminLoggedIn,brandController.postAddBrand);
brandRouter.get('/brands/edit/:id',isAdminLoggedIn,brandController.getEditBrand);
brandRouter.put('/brands/edit/:id',isAdminLoggedIn,brandController.postEditBrand);
brandRouter.patch('/brands/unlist/:id',isAdminLoggedIn,brandController.unlistedBrand);
brandRouter.patch('/brands/list/:id',isAdminLoggedIn,brandController.listBrand);

module.exports=brandRouter;