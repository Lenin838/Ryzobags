const express = require('express');
const adminRouter = express.Router();
const adminController = require('../../controllers/admins/adminAuthController');
const categoryRouter = require('./adminCategoryRoutes'); 
const brandRouter = require('../../routes/admin/adminBrandRoutes');
const productRouter = require('../../routes/admin/adminProductRoutes');
const { isAdminLoggedIn, isAdminLoggedOut } = require('../../middlewares/adminAuth');


adminRouter.use('/',productRouter);
adminRouter.use('/',brandRouter);
adminRouter.use('/',categoryRouter); 


adminRouter.get('/login' ,isAdminLoggedOut,adminController.loadLoginPage);
adminRouter.post("/login" ,isAdminLoggedOut, adminController.verifyLogin);

adminRouter.use(isAdminLoggedIn);
adminRouter.get("/logout",adminController.adminLogout);
adminRouter.get('/dashboard',adminController.loadHome);
adminRouter.get('/users-management',adminController.getUsers);
adminRouter.get('/block-user/:id',adminController.blockUser);
adminRouter.get('/unblock-user/:id',adminController.unblockUser);






module.exports=adminRouter;