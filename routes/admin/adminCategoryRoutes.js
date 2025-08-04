const express = require('express');
const categoryRouter = express.Router();
const categoryController = require('../../controllers/admins/categoryController');
const { isAdminLoggedIn } = require('../../middlewares/adminAuth');


categoryRouter.get('/categories',isAdminLoggedIn,categoryController.getCategoryList);
categoryRouter.get('/categories/add', isAdminLoggedIn,categoryController.getAddCategory);
categoryRouter.post('/categories/add', isAdminLoggedIn,categoryController.postAddCategory);
categoryRouter.get('/categories/edit/:id', isAdminLoggedIn,categoryController.getEditCategory);
categoryRouter.put('/categories/edit/:id', isAdminLoggedIn,categoryController.postEditCategory);
categoryRouter.patch('/categories/unlist/:id', isAdminLoggedIn,categoryController.unlistCategory);
categoryRouter.patch('/categories/list/:id', isAdminLoggedIn,categoryController.listCategory);

module.exports = categoryRouter;
