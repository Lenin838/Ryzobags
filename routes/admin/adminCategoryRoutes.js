const express = require('express');
const categoryRouter = express.Router();
const categoryController = require('../../controllers/admins/categoryController');


categoryRouter.get('/categories',categoryController.getCategoryList);
categoryRouter.get('/categories/add', categoryController.getAddCategory);
categoryRouter.post('/categories/add', categoryController.postAddCategory);
categoryRouter.get('/categories/edit/:id', categoryController.getEditCategory);
categoryRouter.post('/categories/edit/:id', categoryController.postEditCategory);
categoryRouter.get('/categories/unlist/:id', categoryController.unlistCategory);
categoryRouter.get('/categories/list/:id', categoryController.listCategory);

module.exports = categoryRouter;
