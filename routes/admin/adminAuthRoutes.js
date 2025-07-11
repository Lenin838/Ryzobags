const express = require('express');
const adminRouter = express.Router();
const adminController = require('../../controllers/admins/adminAuthController');
const categoryRouter = require('../../routes/admin/adminCategoryRoutes'); 
const brandRouter = require('../../routes/admin/adminBrandRoutes');
const productRouter = require('../../routes/admin/adminProductRoutes');
const { isAdminLoggedIn, isAdminLoggedOut } = require('../../middlewares/adminAuth');
const adminOrderRouter = require('../../routes/admin/adminOrderRoutes');
const adminInventoryRouter = require('../../routes/admin/adminInventory');
const couponRouter = require('../../routes/admin/couponRoutes');
const salesRouter = require('../../routes/admin/salesReportRoutes');


adminRouter.use('/',salesRouter);
adminRouter.use('/',couponRouter);
adminRouter.use('/',adminInventoryRouter);
adminRouter.use('/',adminOrderRouter);
adminRouter.use('/',productRouter);
adminRouter.use('/',brandRouter);
adminRouter.use('/',categoryRouter); 


adminRouter.get('/login' ,isAdminLoggedOut,adminController.loadLoginPage);
adminRouter.post("/login" ,isAdminLoggedOut, adminController.verifyLogin);

adminRouter.use(isAdminLoggedIn);
adminRouter.get("/logout",adminController.adminLogout);
adminRouter.get('/dashboard',adminController.loadHome);
adminRouter.get('/users-management',adminController.getUsers);
adminRouter.post('/block-user/:id',adminController.blockUser);
adminRouter.post('/unblock-user/:id',adminController.unblockUser);






module.exports=adminRouter;