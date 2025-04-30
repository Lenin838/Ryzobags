const express = require('express');
const brandRouter = express.Router();
const brandController = require('../../controllers/admins/brandController');


brandRouter.get('/brands',brandController.getBrandList);
brandRouter.get('/brands/add',brandController.getAddBrand);
brandRouter.post('/brands/add',brandController.postAddBrand);
brandRouter.get('/brands/edit/:id',brandController.getEditBrand);
brandRouter.post('/brands/edit/:id',brandController.postEditBrand);
brandRouter.get('/brands/unlist/:id',brandController.unlistedBrand);
brandRouter.get('/brands/list/:id',brandController.listBrand);

module.exports=brandRouter;