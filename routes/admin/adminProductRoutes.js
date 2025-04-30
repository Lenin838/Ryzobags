const express = require('express');
const productRouter = express.Router();
const productController = require('../../controllers/admins/adminProductController');
const { multerUpload, resizeAndSaveImages } = require('../../middlewares/upload');


productRouter.get('/products', productController.loadProductList);
productRouter.get('/products/add', productController.loadAddProductPage);
productRouter.post('/products/add', multerUpload.fields([{name:'mainImage',maxCount:1},{name:'subImages',maxCount:3}]), productController.addProduct);
productRouter.get('/products/edit/:id', productController.loadEditProductPage);
productRouter.post('/products/edit/:id', multerUpload.fields([{name:'mainImage',maxCount:1},{name:'subImages',maxCount:3}]), productController.editProduct);
productRouter.post('/products/toggle-listing/:id', productController.toggleProductListing);

module.exports = productRouter;