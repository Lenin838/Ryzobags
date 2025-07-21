const express = require('express');
const categoryRouter = express.Router();
const categoryController = require('../../controllers/admins/categoryController');


categoryRouter.get('/categories',categoryController.getCategoryList);
categoryRouter.get('/categories/add', categoryController.getAddCategory);
categoryRouter.post('/categories/add', categoryController.postAddCategory);
categoryRouter.get('/categories/edit/:id', categoryController.getEditCategory);
categoryRouter.put('/categories/edit/:id', categoryController.postEditCategory);
categoryRouter.patch('/categories/unlist/:id', categoryController.unlistCategory);
categoryRouter.patch('/categories/list/:id', categoryController.listCategory);

module.exports = categoryRouter;
