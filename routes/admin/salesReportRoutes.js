const express = require("express");
const salesRouter = express.Router();
const salesController = require('../../controllers/admins/salesReportController');
const {isAdminLoggedIn} = require('../../middlewares/adminAuth');



salesRouter.get("/sales-report",isAdminLoggedIn,salesController.getSalesReport);
salesRouter.get("/sales-report/download-excel",isAdminLoggedIn,salesController.downloadExcelReport);
salesRouter.get("/sales-report/download-pdf",isAdminLoggedIn,salesController.downloadPDFReport);

module.exports = salesRouter;