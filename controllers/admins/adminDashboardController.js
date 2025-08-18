const mongoose = require("mongoose");
const Order = require("../../models/order");
const Product = require("../../models/product");
const Category = require("../../models/category");
const Brand = require("../../models/brand");
const moment = require("moment");
const statusCode = require('../../config/statusCode');
const message = require('../../config/messages');

const dashboardController = {
  getDashboardData: async (req, res) => {
    try {
      const { filter = "daily", startDate, endDate } = req.query;

      let start, end = moment().endOf("day").toDate();
      switch (filter) {
        case "daily":
          start = moment().startOf("day").toDate();
          break;
        case "weekly":
          start = moment().startOf("week").toDate();
          break;
        case "monthly":
          start = moment().startOf("month").toDate();
          break;
        case "yearly":
          start = moment().startOf("year").toDate();
          break;
        case "custom":
          start = startDate ? moment(startDate).startOf("day").toDate() : moment().startOf("month").toDate();
          end = endDate ? moment(endDate).endOf("day").toDate() : moment().endOf("day").toDate();
          break;
        default:
          start = moment().startOf("day").toDate();
      }


      const orderQuery = { 
        status: { $in: ['delivered', 'processing', 'shipped', 'pending','partially returned'] }, 
        orderDate: { $gte: start, $lte: end } 
      };
      
      
      const totalOrders = await Order.countDocuments(orderQuery);

      const totalProducts = await Product.countDocuments({ isListed: true });
      const totalCategories = await Category.countDocuments({ isActive: true });

      const revenueData = await Order.aggregate([
        {
          $match: {
            status: {$in: ["delivered","partially returned"]},
            orderDate: { $gte: start, $lte: end },
            amountPaid: { $exists: true, $ne: null, $gt: 0 } 
          },
        },
        {
          $group: {
            _id: {
              $dateToString: {
                format:
                  filter === "daily"
                    ? "%Y-%m-%d"
                    : filter === "weekly"
                    ? "%Y-%U"
                    : filter === "monthly"
                    ? "%Y-%m"
                    : "%Y",
                date: "$orderDate",
              },
            },
            totalRevenue: { $sum: "$amountPaid" },
            orderCount: { $sum: 1 }
          },
        },
        {
          $sort: { _id: 1 },
        },
      ]);


      const chartLabels = revenueData.map((data) => data._id);
      const chartValues = revenueData.map((data) => data.totalRevenue);
      const totalRevenue = revenueData.reduce((sum, data) => sum + data.totalRevenue, 0);

      const topProducts = await Order.aggregate([
        {
          $match: {
            status: {$in: ['delivered','partially returned']},
            orderDate: { $gte: start, $lte: end },
          },
        },
        { $unwind: "$items" },
        {
          $match: { 
            "items.status": "delivered",
            "items.quantity": { $gt: 0 } 
          },
        },
        {
          $group: {
            _id: "$items.productId",
            totalSold: { $sum: "$items.quantity" },
          },
        },
        {
          $lookup: {
            from: "products",
            localField: "_id",
            foreignField: "_id",
            as: "product",
          },
        },
        { $unwind: "$product" },
        {
          $project: {
            name: "$product.name",
            totalSold: 1,
          },
        },
        { $sort: { totalSold: -1 } },
        { $limit: 10 },
      ]);


      const topCategories = await Order.aggregate([
        {
          $match: {
            status: {$in: ['delivered','partially returned']},
            orderDate: { $gte: start, $lte: end },
          },
        },
        { $unwind: "$items" },
        {
          $match: { 
            "items.status": "delivered",
            "items.quantity": { $gt: 0 }
          },
        },
        {
          $lookup: {
            from: "products",
            localField: "items.productId",
            foreignField: "_id",
            as: "product",
          },
        },
        { $unwind: "$product" },
        {
          $group: {
            _id: "$product.category",
            totalSold: { $sum: "$items.quantity" },
          },
        },
        {
          $lookup: {
            from: "categories",
            localField: "_id",
            foreignField: "_id",
            as: "category",
          },
        },
        { $unwind: "$category" },
        {
          $project: {
            name: "$category.name",
            totalSold: 1,
          },
        },
        { $sort: { totalSold: -1 } },
        { $limit: 10 },
      ]);


      const topBrands = await Order.aggregate([
        {
          $match: {
            status: {$in: ['delivered','partially returned']},
            orderDate: { $gte: start, $lte: end },
          },
        },
        { $unwind: "$items" },
        {
          $match: { 
            "items.status": "delivered",
            "items.quantity": { $gt: 0 }
          },
        },
        {
          $lookup: {
            from: "products",
            localField: "items.productId",
            foreignField: "_id",
            as: "product",
          },
        },
        { $unwind: "$product" },
        {
          $group: {
            _id: "$product.brand",
            totalSold: { $sum: "$items.quantity" },
          },
        },
        {
          $lookup: {
            from: "brands",
            localField: "_id",
            foreignField: "_id",
            as: "brand",
          },
        },
        { $unwind: "$brand" },
        {
          $project: {
            name: "$brand.name",
            totalSold: 1,
          },
        },
        { $sort: { totalSold: -1 } },
        { $limit: 10 },
      ]);



      const responseData = {
        body: "dashboard",
        totalRevenue: totalRevenue || 0,
        chartLabels: chartLabels || [],
        chartValues: chartValues || [],
        topProducts: topProducts || [],
        topCategories: topCategories || [],
        topBrands: topBrands || [],
        filter,
        startDate: startDate || moment(start).format("YYYY-MM-DD"),
        endDate: endDate || moment(end).format("YYYY-MM-DD"),
        totalCategories: totalCategories || 0,
        totalOrders: totalOrders || 0,
        totalProducts: totalProducts || 0
      };

      

      res.render("admin/layout", responseData);
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
      console.error("Error stack:", error.stack);
      res.status(statusCode.INTERNAL_SERVER_ERROR).json({ error: message.SERVER_ERROR, details: error.message });
    }
  },
};

module.exports = dashboardController;