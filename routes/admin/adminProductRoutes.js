const express = require('express');
const productRouter = express.Router();
const productController = require('../../controllers/admins/adminProductController');
const { multerUpload, resizeAndSaveImages } = require('../../middlewares/upload');
const { isAdminLoggedIn} = require('../../middlewares/adminAuth');

productRouter.get('/products', isAdminLoggedIn,productController.loadProductList);
productRouter.get('/products/add', isAdminLoggedIn,productController.loadAddProductPage);
productRouter.post('/products/add', multerUpload.fields([{name:'mainImage',maxCount:1},{name:'subImages',maxCount:3}]), isAdminLoggedIn,productController.addProduct);
productRouter.get('/products/edit/:id', isAdminLoggedIn,productController.loadEditProductPage);
productRouter.put('/products/edit/:id', multerUpload.fields([{name:'mainImage',maxCount:1},{name:'subImages',maxCount:3}]), isAdminLoggedIn,productController.editProduct);
productRouter.patch('/products/toggle-listing/:id', isAdminLoggedIn,productController.toggleProductListing);

module.exports = productRouter;