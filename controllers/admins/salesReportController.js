const Order = require("../../models/order");
const excelJS = require("exceljs");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

const getDeliveredOrdersWithItems = async (filter) => {
  const orders = await Order.find({
    ...filter,
    "items.status": "delivered"
  }).populate("couponId").lean().sort({createdAt: -1});

  return orders
    .map(order => {
      const deliveredItems = order.items.filter(item => item.status === "delivered");
      if (deliveredItems.length === 0) return null;
      
      const deliveredTotal = deliveredItems.reduce((sum, item) => {
        return sum + (item.itemSalePrice * item.quantity);
      }, 0);
      
      const totalOrderValue = order.items.reduce((sum, item) => {
        return sum + (item.itemSalePrice * item.quantity);
      }, 0);
      
      const proportionalDiscount = order.discount || 0;
      
      return { 
        ...order, 
        items: deliveredItems,
        actualTotal: deliveredTotal,
        actualDiscount: proportionalDiscount,
        originalTotal: order.totalAmount,
        originalDiscount: order.discount || 0
      };
    })
    .filter(order => order !== null);
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

      const orders = await getDeliveredOrdersWithItems(filter);

      const reportData = {
        totalOrders: orders.length,
        totalSales: orders.reduce((sum, o) => sum + (o.actualTotal || 0), 0),
        totalDiscount: orders.reduce((sum, o) => sum + (o.actualDiscount || 0), 0),
        order: orders, 
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

      const orders = await getDeliveredOrdersWithItems(filter);

      const workbook = new excelJS.Workbook();
      const worksheet = workbook.addWorksheet("Sales Report");

      worksheet.columns = [
        { header: "Order ID", key: "orderId", width: 20 },
        { header: "Date", key: "orderDate", width: 20 },
        { header: "Total Amount", key: "totalAmount", width: 15 },
        { header: "Discount", key: "discount", width: 15 },
        { header: "Coupon Code", key: "couponCode", width: 20 },
      ];

      orders.forEach(order => {
        worksheet.addRow({
          orderId: order.orderId,
          orderDate: new Date(order.orderDate).toLocaleDateString(),
          totalAmount: order.actualTotal || 0,
          discount: order.actualDiscount || 0,
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

      const orders = await getDeliveredOrdersWithItems(filter);

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
      doc.moveDown(2);


      const tableTop = doc.y;
      const tableLeft = 50;
      const pageWidth = doc.page.width;
      const margin = 50;
      const tableWidth = pageWidth - (margin * 2);

      const colWidths = {
        sno: 40,
        orderId: 90,
        amount: 80,
        discount: 80,
        coupon: 90,
        date: 110
      };

      const colPositions = {
        sno: tableLeft,
        orderId: tableLeft + colWidths.sno,
        amount: tableLeft + colWidths.sno + colWidths.orderId,
        discount: tableLeft + colWidths.sno + colWidths.orderId + colWidths.amount,
        coupon: tableLeft + colWidths.sno + colWidths.orderId + colWidths.amount + colWidths.discount,
        date: tableLeft + colWidths.sno + colWidths.orderId + colWidths.amount + colWidths.discount + colWidths.coupon
      };

      const actualTableWidth = Object.values(colWidths).reduce((sum, width) => sum + width, 0);

      function drawTableHeader(y) {
        doc.fontSize(10).font('Helvetica-Bold');
        
        doc.rect(tableLeft, y, actualTableWidth, 25).fill('#f0f0f0');
        

        doc.fillColor('black');
        
        doc.text('S.No', colPositions.sno + 3, y + 7, { 
          width: colWidths.sno - 6, 
          align: 'center' 
        });
        doc.text('Order ID', colPositions.orderId + 3, y + 7, { 
          width: colWidths.orderId - 6, 
          align: 'center' 
        });
        doc.text('Amount (₹)', colPositions.amount + 3, y + 7, { 
          width: colWidths.amount - 6, 
          align: 'center' 
        });
        doc.text('Discount (₹)', colPositions.discount + 3, y + 7, { 
          width: colWidths.discount - 6, 
          align: 'center' 
        });
        doc.text('Coupon', colPositions.coupon + 3, y + 7, { 
          width: colWidths.coupon - 6, 
          align: 'center' 
        });
        doc.text('Date', colPositions.date + 3, y + 7, { 
          width: colWidths.date - 6, 
          align: 'center' 
        });
        
        doc.strokeColor('black').lineWidth(1);
        doc.rect(tableLeft, y, actualTableWidth, 25).stroke();
        
        let currentX = tableLeft;
        Object.values(colWidths).forEach((width, index) => {
          currentX += width;
          if (index < Object.values(colWidths).length - 1) {
            doc.moveTo(currentX, y).lineTo(currentX, y + 25).stroke();
          }
        });
        
        return y + 25;
      }

      function drawTableRow(y, rowData, rowHeight = 22) {
        doc.fontSize(9).font('Helvetica');
        
        const bgColor = rowData.index % 2 === 0 ? '#ffffff' : '#f9f9f9';
        doc.rect(tableLeft, y, actualTableWidth, rowHeight).fill(bgColor);
        
        doc.fillColor('black');
        
        doc.text(rowData.sno, colPositions.sno + 3, y + 5, { 
          width: colWidths.sno - 6, 
          align: 'center' 
        });
        doc.text(rowData.orderId, colPositions.orderId + 3, y + 5, { 
          width: colWidths.orderId - 6, 
          align: 'left' 
        });
        doc.text(rowData.amount, colPositions.amount + 3, y + 5, { 
          width: colWidths.amount - 6, 
          align: 'right' 
        });
        doc.text(rowData.discount, colPositions.discount + 3, y + 5, { 
          width: colWidths.discount - 6, 
          align: 'right' 
        });
        doc.text(rowData.coupon, colPositions.coupon + 3, y + 5, { 
          width: colWidths.coupon - 6, 
          align: 'center' 
        });
        doc.text(rowData.date, colPositions.date + 3, y + 5, { 
          width: colWidths.date - 6, 
          align: 'center' 
        });
        
        doc.strokeColor('black').lineWidth(0.5);
        doc.rect(tableLeft, y, actualTableWidth, rowHeight).stroke();
        
        let currentX = tableLeft;
        Object.values(colWidths).forEach((width, index) => {
          currentX += width;
          if (index < Object.values(colWidths).length - 1) {
            doc.moveTo(currentX, y).lineTo(currentX, y + rowHeight).stroke();
          }
        });
        
        return y + rowHeight;
      }

      let currentY = drawTableHeader(tableTop);

      let totalAmount = 0;
      let totalDiscount = 0;

      orders.forEach((orderItem, index) => {
        if (currentY > doc.page.height - 150) {
          doc.addPage();
          currentY = drawTableHeader(50);
        }

        const rowData = {
          index: index,
          sno: (index + 1).toString(),
          orderId: orderItem.orderId || 'N/A',
          amount: (orderItem.actualTotal || 0).toFixed(2),
          discount: (orderItem.actualDiscount || 0).toFixed(2),
          coupon: orderItem.couponId?.code || 'N/A',
          date: new Date(orderItem.orderDate).toLocaleDateString('en-IN')
        };

        currentY = drawTableRow(currentY, rowData);
        
        totalAmount += orderItem.actualTotal || 0;
        totalDiscount += orderItem.actualDiscount || 0;
      });

      currentY += 30;
      
      if (currentY > doc.page.height - 150) {
        doc.addPage();
        currentY = 50;
      }

      doc.fontSize(12).font('Helvetica-Bold');
      doc.fillColor('black');
      doc.text('Summary', tableLeft, currentY);
      currentY += 25;
      
      const summaryBoxHeight = 80;
      doc.rect(tableLeft, currentY, actualTableWidth, summaryBoxHeight).fill('#f8f8f8');
      doc.strokeColor('black').lineWidth(1);
      doc.rect(tableLeft, currentY, actualTableWidth, summaryBoxHeight).stroke();
      
      doc.fontSize(10).font('Helvetica');
      doc.fillColor('black');
      
      const summaryY = currentY + 10;
      doc.text(`Total Orders: ${orders.length}`, tableLeft + 10, summaryY);
      doc.text(`Total Amount: ₹${totalAmount.toFixed(2)}`, tableLeft + 10, summaryY + 15);
      doc.text(`Total Discount: ₹${totalDiscount.toFixed(2)}`, tableLeft + 10, summaryY + 30);
      
      doc.font('Helvetica-Bold');
      doc.text(`Net Amount: ₹${(totalAmount - totalDiscount).toFixed(2)}`, tableLeft + 10, summaryY + 50);

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