const express = require("express");
const dashboardRouter = express.Router();
const dashboardController = require("../../controllers/admins/adminDashboardController");
const {isAdminLoggedIn} = require("../../middlewares/adminAuth");


dashboardRouter.get("/dashboard",isAdminLoggedIn,dashboardController.getDashboardData);

module.exports = dashboardRouter;