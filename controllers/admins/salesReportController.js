const Order = require("../../models/order");
const excelJS = require("exceljs");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

const getDeliveredOrdersWithItems = async (filter) => {
  const order = await Order.find({
    ...filter,
    "items.status": "delivered"
  }).populate("couponId").lean().sort({createdAt: -1});

  return order
    .map(order => {
      const deliveredItems = order.items.filter(item => item.status === "delivered");
      return { ...order, items: deliveredItems };
    })
    .filter(order => order.items.length > 0);
};

const salesController = {
  getSalesReport: async (req, res) => {
    try {
      const { range, startDate, endDate } = req.query;

      let filter = {};
      const now = new Date();
      let start, end;

      if (range === "daily") {
        start = new Date(now.setHours(0, 0, 0, 0));
        end = new Date(now.setHours(23, 59, 59, 999));
      } else if (range === "weekly") {
        const today = new Date();
        const startOfWeek = new Date(today.setDate(today.getDate() - today.getDay()));
        start = new Date(startOfWeek.setHours(0, 0, 0, 0));
        end = new Date();
      } else if (range === "monthly") {
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        end.setHours(23, 59, 59, 999);
      } else if (range === "yearly") {
        start = new Date(now.getFullYear(), 0, 1);
        end = new Date(now.getFullYear(), 11, 31);
        end.setHours(23, 59, 59, 999);
      } else if (range === "custom" && startDate && endDate) {
        start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
      }

      if (start && end) {
        filter.orderDate = { $gte: start, $lte: end };
      }

      const order = await getDeliveredOrdersWithItems(filter);

      const reportData = {
        totalOrders: order.length,
        totalSales: order.reduce((sum, o) => sum + (o.totalAmount || 0), 0),
        totalDiscount: order.reduce((sum, o) => sum + (o.discount || 0), 0),
        order,
        startDate: start?.toDateString() || "",
        endDate: end?.toDateString() || "",
      };

      res.render("admin/layout", {
        body: "sales-report",
        reportData,
        range: range || '',
        startDate: req.query.startDate || '',
        endDate: req.query.endDate || ''
      });
    } catch (err) {
      console.error("Sales report error:", err.message);
      res.status(500).json({ message: "Failed to load sales report" });
    }
  },

  downloadExcelReport: async (req, res) => {
    try {
      const { range, startDate, endDate } = req.query;
      let filter = {};
      const now = new Date();
      let start, end;

      if (range === "daily") {
        start = new Date(now.setHours(0, 0, 0, 0));
        end = new Date(now.setHours(23, 59, 59, 999));
      } else if (range === "weekly") {
        const today = new Date();
        const startOfWeek = new Date(today.setDate(today.getDate() - today.getDay()));
        start = new Date(startOfWeek.setHours(0, 0, 0, 0));
        end = new Date();
      } else if (range === "monthly") {
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        end.setHours(23, 59, 59, 999);
      } else if (range === "yearly") {
        start = new Date(now.getFullYear(), 0, 1);
        end = new Date(now.getFullYear(), 11, 31);
        end.setHours(23, 59, 59, 999);
      } else if (range === "custom" && startDate && endDate) {
        start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
      }

      if (start && end) {
        filter.orderDate = { $gte: start, $lte: end };
      }

      const order = await getDeliveredOrdersWithItems(filter);

      const workbook = new excelJS.Workbook();
      const worksheet = workbook.addWorksheet("Sales Report");

      worksheet.columns = [
        { header: "Order ID", key: "orderId", width: 20 },
        { header: "Date", key: "orderDate", width: 20 },
        { header: "Total Amount", key: "totalAmount", width: 15 },
        { header: "Discount", key: "discount", width: 15 },
        { header: "Coupon Code", key: "couponCode", width: 20 },
      ];

      order.forEach(order => {
        worksheet.addRow({
          orderId: order.orderId,
          orderDate: new Date(order.orderDate).toLocaleDateString(),
          totalAmount: order.totalAmount,
          discount: order.discount || 0,
          couponCode: order.couponId?.code || "N/A",
        });
      });

      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", "attachment; filename=sales-report.xlsx");

      await workbook.xlsx.write(res);
      res.end();
    } catch (err) {
      console.error("Excel Report error: ", err.message);
      res.status(500).json({ message: "Failed to generate Excel report" });
    }
  },

  downloadPDFReport: async (req, res) => {
    try {
      const { range, startDate, endDate } = req.query;
      let filter = {};
      const now = new Date();
      let start, end;

      if (range === "daily") {
        start = new Date(now.setHours(0, 0, 0, 0));
        end = new Date(now.setHours(23, 59, 59, 999));
      } else if (range === "weekly") {
        const today = new Date();
        const startOfWeek = new Date(today.setDate(today.getDate() - today.getDay()));
        start = new Date(startOfWeek.setHours(0, 0, 0, 0));
        end = new Date();
      } else if (range === "monthly") {
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        end.setHours(23, 59, 59, 999);
      } else if (range === "yearly") {
        start = new Date(now.getFullYear(), 0, 1);
        end = new Date(now.getFullYear(), 11, 31);
        end.setHours(23, 59, 59, 999);
      } else if (range === "custom" && startDate && endDate) {
        start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
      }

      if (start && end) {
        filter.orderDate = { $gte: start, $lte: end };
      }

      const order = await getDeliveredOrdersWithItems(filter);

      const doc = new PDFDocument();
      const reportDir = path.join(__dirname, "../../public/reports");
      const fileName = `sales_report_${Date.now()}.pdf`;
      const filePath = path.join(reportDir, fileName);

      if (!fs.existsSync(reportDir)) {
        fs.mkdirSync(reportDir, { recursive: true });
      }

      const writeStream = fs.createWriteStream(filePath);
      doc.pipe(writeStream);

      doc.fontSize(16).text("Sales Report", { align: "center" });
      doc.moveDown();

      doc.fontSize(12).text(`Date Range: ${start?.toDateString() || ''} to ${end?.toDateString() || ''}`);
      doc.moveDown();

      order.forEach((order, index) => {
        doc.fontSize(10).text(
          `${index + 1}. ${order.orderId} | ₹${order.totalAmount} | Discount: ₹${order.discount || 0} | Coupon: ${order.couponId?.code || "N/A"} | ${new Date(order.orderDate).toLocaleString()}`
        );
      });

      doc.end();

      writeStream.on("finish", () => {
        res.download(filePath, "sales_report.pdf", (err) => {
          if (err) {
            console.error("Download error:", err);
            res.status(500).send("Failed to download PDF report");
          } else {
            fs.unlink(filePath, (unlinkErr) => {
              if (unlinkErr) console.error("Error deleting file:", unlinkErr);
            });
          }
        });
      });

      writeStream.on("error", (err) => {
        console.error("Write stream error:", err);
        res.status(500).send("Failed to generate PDF report");
      });

    } catch (err) {
      console.error("PDF Report error: ", err.message);
      res.status(500).send("Failed to generate PDF report");
    }
  }
};

module.exports = salesController;
