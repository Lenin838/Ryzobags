const express = require("express");
const couponRouter = express.Router();
const couponController = require('../../controllers/admins/couponController');
const {isAdminLoggedIn} = require("../../middlewares/adminAuth");


couponRouter.get("/coupons/list",isAdminLoggedIn,couponController.listCoupons);
couponRouter.post("/coupons/create",isAdminLoggedIn,couponController.createCoupon);
couponRouter.put('/coupons/edit/:id',isAdminLoggedIn,couponController.updateCoupon);
couponRouter.patch('/coupons/delete/:id',isAdminLoggedIn,couponController.deleteCoupon);

module.exports = couponRouter;