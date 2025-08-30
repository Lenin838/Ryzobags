const Order = require('../../models/order');
const Product = require('../../models/product');
const Address = require('../../models/address');
const User = require('../../models/User');
const WalletTransaction = require('../../models/wallet');
const PDFDocument = require('pdfkit');
const Coupon = require('../../models/coupon');
const address = require('../../models/address');
const nodemailer = require('nodemailer');
const sendOtpEmail = require('../../controllers/users/otpService');
const template = require('../../controllers/users/emailTemplates');
const statusCode = require('../../config/statusCode');
const message = require('../../config/messages');
const product = require('../../models/product');

const orderController = {
    generateTransactionId: () => {
        return 'TXN' + Date.now() + Math.random().toString(36).substr(2, 9);
    },

    getUserWalletBalance: async (userId) => {
        try {
            const latestTransaction = await WalletTransaction
                .findOne({ userId })
                .sort({ createdAt: -1 });
            
            return latestTransaction ? latestTransaction.wallet.balance : 0;
        } catch (error) {
            console.error('Error getting wallet balance:', error);
            return 0;
        }
    },

    creditWallet: async (userId, amount, description, orderId, productId = null) => {
        try {
            const currentBalance = await orderController.getUserWalletBalance(userId);
            const newBalance = currentBalance + amount;

            const walletTransaction = new WalletTransaction({
                userId,
                transactionId: orderController.generateTransactionId(),
                productId: productId || 'N/A',
                amount,
                type: 'refund',
                status: 'success',
                reference: orderId,
                description,
                wallet: {
                    balance: newBalance,
                    lastUpdated: new Date()
                }
            });

            await walletTransaction.save();
            return newBalance;
        } catch (error) {
            console.error('Error crediting wallet:', error);
            throw error;
        }
    },

    cancelOrder: async (req, res) => {
        try {
            
            const {orderId,reason} = req.body;
            const order = await Order.findOne({ orderId, userId: req.user._id });

            if (!order) {
                return res.status(statusCode.NOT_FOUND).json({ error: message.ORDER_NOT_FOUND });
            }

            if (!["pending", "processing"].includes(order.status)) {
                return res.status(statusCode.BAD_REQUEST).json({ error: message.CANNOT_CANCEL });
            }

            const refundAmount = order.totalAmount || 0;

            order.status = "cancelled";
            order.cancelReason = reason || "Order cancelled by user";
            order.cancelledAt = new Date();
            
            const productIds = [];
            order.items.forEach(item => {
                if (item.status !== "cancelled") {
                    item.status = "cancelled";
                    item.cancelReason = reason || "Order cancelled by user";
                    item.cancelledAt = new Date();
                    productIds.push(item.productId.toString());
                }
            });
            for (const item of order.items) {
                        if (item.productId && item.size) {
                          try {
                            await Product.findByIdAndUpdate(item.productId._id || item.productId, {
                              $inc: { 'variants.$[variant].quantity': item.quantity },
                            }, {
                              arrayFilters: [{ 'variant.size': item.size }],
                            });
                          } catch (inventoryError) {
                            console.error('Error updating inventory:', inventoryError);
                          }
                        }
                      }


            await order.save();
            try{
             const user = await User.findById(req.user._id).select('email');
                if(user?.email){
                    await sendOtpEmail(user.email,"Order Cancelled ",template.cancelOrderTemplate(orderId));
                }
            }catch(err){
                console.error("Error sending cancellation email:",err);
            }
            if (refundAmount > 0 && order.paymentMethod==="razorpay") {
                try {
                    const newBalance = await orderController.creditWallet(
                        req.user._id,
                        refundAmount,
                        `Refund for cancelled order #${order.orderId}`,
                        order._id.toString(),
                        productIds.join(',')
                    );
                    res.json({ 
                        success: message.CANCEL_SUCCESS_REFUND,
                        orderId: order.orderId,
                        status: order.status,
                        refundAmount: refundAmount,
                        walletBalance: newBalance
                    });
                } catch (walletError) {
                    console.error('Wallet credit failed:', walletError);
                    res.json({ 
                        success: message.CANCEL_REFUND_FAILED,
                        orderId: order.orderId,
                        status: order.status,
                        refundAmount: refundAmount,
                        walletError: true
                    });
                }
            } else {
                res.json({ 
                    success: message.CANCEL_SUCCESS,
                    orderId: order.orderId,
                    status: order.status
                });
            }
        } catch (err) {
            console.error(err);
            res.status(statusCode.INTERNAL_SERVER_ERROR).json({ error: message.SERVER_ERROR });
        }
    },

    cancelOrderItem: async (req, res) => {
        try {
            const { orderId, itemId, reason } = req.body;
            const order = await Order.findOne({ orderId, userId: req.user._id });

            if (!order) {
                return res.status(statusCode.NOT_FOUND).json({ error: message.ORDER_NOT_FOUND });
            }

            if (!["pending", "processing",'partially returned'].includes(order.status)) {
                return res.status(statusCode.BAD_REQUEST).json({ error: message.CANNOT_CANCEL });
            }

            const itemIndex = order.items.findIndex(item => item._id.toString() === itemId);

            if (itemIndex === -1) {
                return res.status(statusCode.NOT_FOUND).json({ error: message.ITEM_NOT_FOUND });
            }

            const targetItem = order.items[itemIndex];

            if (!["pending", "processing"].includes(targetItem.status)) {
                return res.status(statusCode.BAD_REQUEST).json({ error: message.CANNOT_CANCEL });
            }

            const productId = targetItem.productId.toString();

            let itemRefundAmount = (targetItem.itemSalePrice || 0) * (targetItem.quantity || 0);

            if (order.paymentMethod === "razorpay") {
                const totalDiscounted = order.items.reduce((sum, i) => {
                    return sum + ((i.discountedPrice || i.itemSalePrice || 0) * (i.quantity || 0));
                }, 0);

                const couponDiscount = order.discount || 0;

                const itemTotal = (targetItem.discountedPrice || targetItem.itemSalePrice || 0) * (targetItem.quantity || 0);
                const couponShare = totalDiscounted > 0 ? (itemTotal / totalDiscounted) * couponDiscount : 0;

                itemRefundAmount = itemTotal - couponShare;
            }

            targetItem.status = "cancelled";
            targetItem.cancelReason = reason || "Item cancelled by user";
            targetItem.cancelledAt = new Date();

            const activeItems = order.items.filter(item => item.status !== "cancelled");

            if (activeItems.length === 0) {
                order.status = "cancelled";
                order.cancelReason = "All items cancelled";
                order.cancelledAt = new Date();
                order.totalAmount = 0;
                order.discount = 0;
            } else {
                const newSubtotal = activeItems.reduce((sum, item) => {
                    const itemPrice = typeof item.itemSalePrice === 'number' ? item.itemSalePrice : 0;
                    const itemQuantity = typeof item.quantity === 'number' ? item.quantity : 0;
                    return sum + (itemPrice * itemQuantity);
                }, 0);

                const newDiscount = order.discount || 0;
                const newTotalAmount = Math.max(newSubtotal - newDiscount, 0);

                order.totalAmount = newTotalAmount;
            }

            for (const item of order.items) {
                if (item.productId && item.size) {
                    try {
                        await Product.findByIdAndUpdate(item.productId._id || item.productId, {
                            $inc: { 'variants.$[variant].quantity': item.quantity },
                        }, {
                            arrayFilters: [{ 'variant.size': item.size }],
                        });
                    } catch (inventoryError) {
                        console.error('Error updating inventory:', inventoryError);
                    }
                }
            }

            await order.save();
            try{
                const user = await User.findById(req.user._id).select("email");
                if(user?.email){
                    await sendOtpEmail(user.email,"Cancel order Item",template.cancelOrderTemplate(orderId));
                }
            }catch(err){
                console.error("error in sending cancel email:",err);
            }

            let walletResponse = {};
            if (itemRefundAmount > 0 && order.paymentMethod === "razorpay") {
                try {
                    const product = await Product.findById(productId);
                    let variant;
                    if(product){
                        variant = product.variants.find((v)=>v.size?.toLowerCase() === targetItem.size?.toLowerCase());
                    }

                    if(variant){
                        if(variant && variant.quantity < 5 && product.offer.discountPercentage === 20){
                            itemRefundAmount = (targetItem.itemSalePrice || 0)* (targetItem.quantity || 0) * 0.4; 
                        }
                    }
                    const newBalance = await orderController.creditWallet(
                        req.user._id,
                        itemRefundAmount,
                        `Refund for cancelled item in order #${order.orderId}`,
                        order._id.toString(),
                        productId
                    );
                    walletResponse = {
                        refundAmount: itemRefundAmount,
                        walletBalance: newBalance
                    };
                } catch (walletError) {
                    console.error('Wallet credit failed:', walletError);
                    walletResponse = {
                        refundAmount: itemRefundAmount,
                        walletError: "Refund failed. Please contact support."
                    };
                }
            }

            res.json({
                success: "Item cancelled successfully" + (itemRefundAmount > 0 ? " and refund credited to wallet" : ""),
                orderId: order.orderId,
                itemId: targetItem._id,
                orderStatus: order.status,
                activeItemsCount: activeItems.length,
                newTotalAmount: order.totalAmount,
                couponDiscount: order.discount,
                ...walletResponse
            });
        } catch (err) {
            console.error(err);
            res.status(statusCode.INTERNAL_SERVER_ERROR).json({ error:message.SERVER_ERROR});
        }
    },

    getOrderDetails: async (req, res) => {
        try {
            const order = await Order.findById(req.params.id)
                .populate("items.productId")
                .populate("address.address")
                .lean();

            if (!order || order.userId.toString() !== req.user._id.toString()) {
                req.flash("error", "Order not found");
                return res.redirect("/user/profile?tab=orders");
            }

            if (!order.items || !Array.isArray(order.items)) {
                console.error(`Order ${order.orderId} has invalid items array:`, order.items);
                req.flash("error", "Invalid order data");
                return res.redirect("/user/profile?tab=orders");
            }

            let selectedAddress = null;

            try {
                const userAddressDoc = await Address.findOne({ userId: order.userId }).lean();

                if (userAddressDoc && userAddressDoc.address && Array.isArray(userAddressDoc.address)) {
                    if (order.address) {
                        selectedAddress = userAddressDoc.address.find(
                            (addr) => addr._id.toString() === order.address.toString()
                        );
                    }

                    if (!selectedAddress) {
                        selectedAddress = userAddressDoc.address.find(
                            (addr) => addr.isDefault === true && addr.status === "active"
                        );
                    }

                    if (!selectedAddress) {
                        selectedAddress = userAddressDoc.address.find((addr) => addr.status === "active");
                    }

                    if (!selectedAddress && userAddressDoc.address.length > 0) {
                        selectedAddress = userAddressDoc.address[0];
                    }
                }
            } catch (addressError) {
                console.error("Error fetching user address:", addressError);
            }

            order.items.forEach((item) => {
                if (!item.status) {
                    item.status = order.status === "cancelled" ? "cancelled" : "active";
                }
                if (typeof item.itemSalePrice !== "number") {
                    item.itemSalePrice = 0;
                }
                if (typeof item.quantity !== "number") {
                    item.quantity = 0;
                }
            });

            const activeItems = order.items.filter(
                (item) => item.status !== "cancelled" && item.status !== "returned"
            );

            const regularPriceTotal = activeItems.reduce((total, item) => {
                const variant =
                    item.productId && item.productId.variants
                        ? item.productId.variants.find((v) => v.size === item.size)
                        : null;
                const regularPrice = variant ? variant.regularPrice : 0;
                const qty = parseInt(item.quantity) || 0;
                return total + regularPrice * qty;
            }, 0);

            const salePriceTotal = activeItems.reduce((total, item) => {
                const price = parseFloat(item.itemSalePrice) || 0;
                const qty = parseInt(item.quantity) || 0;
                return total + price * qty;
            }, 0);

            const offerDiscount = regularPriceTotal - salePriceTotal;

            let couponDiscount = 0;
            if (order.paymentMethod === "razorpay" && order.couponId) {
                const totalDiscounted = activeItems.reduce(
                    (sum, i) => sum + i.itemSalePrice * i.quantity,
                    0
                );

                couponDiscount = order.discount || 0;

                activeItems.forEach((item) => {
                    const itemTotal = item.itemSalePrice * item.quantity;
                    const couponShare =
                        totalDiscounted > 0 ? (itemTotal / totalDiscounted) * couponDiscount : 0;

                    item.couponShare = couponShare;
                    item.finalAmount = itemTotal - couponShare;
                });
            }

            const activeItemsTotal = order.totalAmount || salePriceTotal;

            res.render("user/orderDetails", {
                order,
                selectedAddress,
                activeItemsTotal,
                regularPriceTotal,
                salePriceTotal,
                offerDiscount,
                couponDiscount,
                activeTab: "orders",
                success: req.flash("success"),
                error: req.flash("error"),
            });
        } catch (err) {
            console.error("Error in getOrderDetails:", err);
            req.flash("error", "Failed to load order details");
            res.redirect("/user/profile?tab=orders");
        }
    },

    returnEntireOrder: async (req, res) => {
        try {
            const { orderId, reason } = req.body;
            const userId = req.user?._id;
            
            if (!userId) {
                return res.status(statusCode.UNAUTHORIZED).json({ success: false, message: message.USER_NOT_AUTHENTICATED});
            }
            
            const order = await Order.findOne({ _id: orderId, userId: userId });
            
            if (!order) {
                return res.status(statusCode.NOT_FOUND).json({ success: false, message: message.ORDER_NOT_FOUND });
            }
            
            const returnableItems = order.items.filter(item => 
                ['delivered', 'shipped', 'processing'].includes(item.status?.toLowerCase()) &&
                item.status !== 'cancelled' && 
                item.itemStatus !== 'return request' && 
                item.status !== 'return request'
            );
            
            if (returnableItems.length === 0) {
                return res.status(statusCode.BAD_REQUEST).json({ 
                    success: false, 
                    message: message.NO_RETURN_ITEMS 
                });
            }
            
            order.items.forEach(item => {
                if (['delivered', 'shipped', 'processing'].includes(item.status?.toLowerCase()) &&
                    item.status !== 'cancelled' && 
                    item.itemStatus !== 'return request' && 
                    item.status !== 'return request') {
                    item.itemStatus = 'return request';
                    item.status = 'return request';
                    item.reason = reason;
                    item.requestQuantity = item.quantity;
                    item.returnRequestedAt = new Date();
                }
            });
            
            order.returnRequest = {
                isRequested: true,
                reason: reason,
                requestedAt: new Date(),
                type: 'entire_order'
            };
            
            await order.save();
            
            res.json({ 
                success: true, 
                message: message.RETURN_REQUEST_SUBMITTED,
                returnedItemsCount: returnableItems.length
            });
            
        } catch (error) {
            console.error('Error processing entire order return request:', error);
            res.status(statusCode.INTERNAL_SERVER_ERROR).json({ 
                success: false, 
                message: message.SERVER_ERROR + error.message 
            });
        }
    },

    returnOrderItem: async (req, res) => {
        try {
            const { orderId, productId, reason } = req.body;
            const userId = req.user?._id;
            
            if (!userId) {
                return res.status(statusCode.UNAUTHORIZED).json({ success: false, message: message.USER_NOT_AUTHENTICATED });
            }
            
            const order = await Order.findOne({ _id: orderId, userId: userId }).populate('items.productId');
            
            if (!order) {
                return res.status(statusCode.NOT_FOUND).json({ success: false, message: message.ORDER_NOT_FOUND });
            }
            
            const itemIndex = order.items.findIndex(item => {
                const itemProductId = item.productId._id ? item.productId._id.toString() : item.productId.toString();
                return itemProductId === productId.toString() && 
                    ['delivered', 'shipped', 'processing'].includes(item.status?.toLowerCase()) &&
                    item.status !== 'cancelled' &&
                    item.itemStatus !== 'return request' &&
                    item.status !== 'return request';
            });
            
            if (itemIndex === -1) {
                return res.status(statusCode.BAD_REQUEST).json({ 
                    success: false, 
                    message: message.NO_RETURN_ITEMS 
                });
            }
            
            order.items[itemIndex].itemStatus = 'return request';
            order.items[itemIndex].status = 'return request';
            order.items[itemIndex].reason = reason;
            order.items[itemIndex].requestQuantity = order.items[itemIndex].quantity;
            order.items[itemIndex].returnRequestedAt = new Date();
            
            if (!order.returnRequest) {
                order.returnRequest = {};
            }
            order.returnRequest.isRequested = true;
            order.returnRequest.reason = reason;
            order.returnRequest.requestedAt = new Date();
            order.returnRequest.type = 'single_item';
            
            await order.save();
            
            res.json({ 
                success: true, 
                message: message.RETURN_REQUEST_SUBMITTED,
                itemIndex: itemIndex
            });
            
        } catch (error) {
            console.error('Error processing return request:', error);
            res.status(statusCode.INTERNAL_SERVER_ERROR).json({ 
                success: false, 
                message: 'Failed to process return request: ' + error.message 
            });
        }
    },

    downloadInvoice: async (req, res) => {
    try {
        const orderId = req.params.id;
        const userId = req.user?._id;

        if (!userId) {
            return res.status(statusCode.UNAUTHORIZED).send({message: message.USER_NOT_AUTHENTICATED});
        }

        const order = await Order.findOne({ _id: orderId, userId: userId })
        .populate("items.productId")
        .populate("couponId");

        if (!order) {
        return res.status(404).send("Order not found");
        }

        const doc = new PDFDocument({
        margin: 50,
        size: "A4",
        bufferPages: true,
        });

        let buffers = [];
        doc.on("data", buffers.push.bind(buffers));
        doc.on("end", () => {
        const pdfData = Buffer.concat(buffers);
        res.setHeader(
            "Content-Disposition",
            `attachment; filename=invoice-${order.orderId}.pdf`
        );
        res.contentType("application/pdf");
        res.send(pdfData);
        });

        // Colors
        const primaryColor = "#3B82F6";
        const secondaryColor = "#10B981";
        const accentColor = "#F59E0B";
        const textColor = "#374151";
        const lightColor = "#F3F4F6";
        const errorColor = "#EF4444";
        const originalPriceColor = "#9CA3AF";
        const discountColor = "#10B981";

        let totalOriginalValue = 0;
        let totalDiscountedValue = 0;
        let productSavings = 0;

        /**
         * STEP 1: Calculate total order value (after product-level discounts, before coupon)
         */
        let totalOrderValue = order.items.reduce((sum, orderItem) => {
        const product = orderItem.productId;
        if (product && product.variants) {
            const variant = product.variants.find((v) => v.size === orderItem.size);
            if (variant) {
            const discountedPrice =
                variant.discountedPrice || variant.regularPrice;
            return sum + discountedPrice * orderItem.quantity;
            }
        }
        return sum;
        }, 0);

        /**
         * STEP 2: Build item list with proportional coupon discount
         */
        const itemsWithDiscounts = order.items.map((item) => {
        const product = item.productId;
        let originalPrice = 0;
        let discountedPrice = 0;
        let couponDiscountAmount = 0;
        let finalPrice = 0;

        if (product && product.variants) {
            const variant = product.variants.find((v) => v.size === item.size);
            if (variant) {
            originalPrice = variant.regularPrice;
            discountedPrice = variant.discountedPrice || originalPrice;

            // proportional coupon distribution
            if (order.couponId && order.discount > 0 && totalOrderValue > 0) {
                const itemValue = discountedPrice * item.quantity;
                couponDiscountAmount =
                (itemValue / totalOrderValue) * order.discount;
            }

            // final price per unit
            finalPrice = Math.max(
                discountedPrice - couponDiscountAmount / item.quantity,
                0
            );

            totalOriginalValue += originalPrice * item.quantity;
            totalDiscountedValue += finalPrice * item.quantity;
            }
        }

        return {
            ...item.toObject(),
            originalPrice,
            discountedPrice,
            couponDiscountAmount, // total coupon discount for this item line
            finalPrice,
        };
        });

        productSavings = totalOriginalValue - totalDiscountedValue;

        // Coupon info
        let couponDiscount = 0;
        let couponCode = "";
        if (order.couponId) {
        couponCode = order.couponId.code || "";
        couponDiscount = order.discount || 0;
        }

        // Total savings
        const totalSavings = productSavings + couponDiscount;

        /**
         * ========= PDF DESIGN =========
         */
        // Header background
        doc.rect(0, 0, doc.page.width, 120).fill(primaryColor);

        doc.fillColor("#FFFFFF")
        .fontSize(24)
        .text("RYZO BAGS", 50, 40, { align: "left" });

        doc.fillColor("#E5E7EB")
        .fontSize(12)
        .text("Premium Bags & Accessories", 50, 70);

        doc.fillColor("#FFFFFF").fontSize(20).text("INVOICE", 0, 80, {
        align: "center",
        });

        // Invoice details
        const boxY = 140;
        doc.roundedRect(50, boxY, 500, 80, 5).fill(lightColor);

        doc.fillColor(primaryColor).fontSize(14).text("INVOICE DETAILS", 65, boxY + 15);

        doc.fillColor(textColor)
        .fontSize(10)
        .text(`Invoice No: ${order.orderId}`, 65, boxY + 40)
        .text(`Date: ${new Date().toLocaleDateString()}`, 65, boxY + 55)
        .text(
            `Order Date: ${new Date(order.orderDate).toLocaleDateString()}`,
            250,
            boxY + 40
        )
        .text(`Payment: ${order.paymentMethod}`, 250, boxY + 55)
        .text(`Status: ${order.status}`, 400, boxY + 40)
        .text(`Payment: ${order.paymentStatus || "N/A"}`, 400, boxY + 55);

        // Fetch Address
        let selectedAddress = null;
        try {
        const userAddressDoc = await Address.findOne({ userId: order.userId });
        if (userAddressDoc && Array.isArray(userAddressDoc.address)) {
            selectedAddress = userAddressDoc.address.find(
            (addr) => addr._id.toString() === order.address.toString()
            );
            if (!selectedAddress) {
            selectedAddress = userAddressDoc.address.find(
                (addr) => addr.status === "active"
            );
            }
            if (!selectedAddress && userAddressDoc.address.length > 0) {
            selectedAddress = userAddressDoc.address[0];
            }
        }
        } catch (addressError) {
        console.error("Error fetching user address:", addressError);
        }

        // Billing address
        const addressY = boxY + 100;
        doc.fillColor(primaryColor).fontSize(12).text("BILLING ADDRESS", 50, addressY);

        doc.fillColor(textColor).fontSize(10);
        let addressText = "";
        if (selectedAddress) {
        addressText = `${selectedAddress.name || "N/A"}\n${
            selectedAddress.landMark || ""
        }\n${selectedAddress.city || "N/A"}, ${
            selectedAddress.state || "N/A"
        } - ${selectedAddress.pincode || "N/A"}\nPhone: ${
            selectedAddress.phone || "N/A"
        }`;
        if (selectedAddress.altPhone) addressText += `, ${selectedAddress.altPhone}`;
        } else {
        addressText = "Address information not available";
        }
        doc.text(addressText, 50, addressY + 20, { width: 200, lineGap: 4 });

        // Order Summary Table
        const summaryY = addressY + 100;
        doc.fillColor(primaryColor).fontSize(12).text("ORDER SUMMARY", 50, summaryY);

        const tableTop = summaryY + 20;
        doc.roundedRect(50, tableTop, 500, 20, 3).fill(primaryColor);

        doc.fillColor("#FFFFFF")
        .fontSize(9)
        .font("Helvetica-Bold")
        .text("PRODUCT", 60, tableTop + 5, { width: 100 })
        .text("SIZE", 170, tableTop + 5)
        .text("QTY", 210, tableTop + 5)
        .text("ORIGINAL", 240, tableTop + 5)
        .text("DISCOUNT", 300, tableTop + 5)
        .text("COUPON", 360, tableTop + 5)
        .text("FINAL", 420, tableTop + 5)
        .text("TOTAL", 470, tableTop + 5, { width: 80, align: "right" });

        // Table rows
        let tablePosition = tableTop + 25;
        doc.fillColor(textColor).font("Helvetica");

        itemsWithDiscounts.forEach((item, index) => {
        const rowY = tablePosition + index * 35;
        const product = item.productId;

        // Alternate row bg
        doc.fillColor(index % 2 === 0 ? lightColor : "#FFFFFF")
            .rect(50, rowY - 5, 500, 30)
            .fill();

        doc.fillColor(textColor).fontSize(8).text(product?.name || "N/A", 60, rowY, {
            width: 100,
        });

        doc.text(item.size || "N/A", 170, rowY).text(item.quantity.toString(), 210, rowY);

        doc.fillColor(originalPriceColor).text(`₹${item.originalPrice.toFixed(2)}`, 240, rowY);

        doc.fillColor(
            item.discountedPrice < item.originalPrice ? discountColor : textColor
        ).text(`₹${item.discountedPrice.toFixed(2)}`, 300, rowY);

        if (item.couponDiscountAmount > 0) {
            doc.fillColor(secondaryColor).text(
            `-₹${(item.couponDiscountAmount / item.quantity).toFixed(2)}`,
            360,
            rowY
            );
        } else {
            doc.fillColor(textColor).text("-", 360, rowY);
        }

        doc.fillColor(textColor).text(`₹${item.finalPrice.toFixed(2)}`, 420, rowY);

        const totalPrice = item.finalPrice * item.quantity;
        doc.fillColor(textColor)
            .font("Helvetica-Bold")
            .text(`₹${totalPrice.toFixed(2)}`, 470, rowY, { width: 80, align: "right" });

        const statusColor =
            item.status === "delivered"
            ? secondaryColor
            : ["cancelled", "failed"].includes(item.status)
            ? errorColor
            : accentColor;

        doc.fillColor(statusColor).fontSize(7).text(item.status.toUpperCase(), 60, rowY + 12);
        });

        // Summary section
        const summaryStart = tablePosition + itemsWithDiscounts.length * 35 + 20;
        const labelCol = 300;
        const valueCol = 450;
        const lineHeight = 20;
        let currentLine = 0;

        doc.fillColor(textColor)
        .fontSize(10)
        .text("Subtotal:", labelCol, summaryStart + currentLine * lineHeight)
        .text(`₹${totalOriginalValue.toFixed(2)}`, valueCol, summaryStart + currentLine * lineHeight, { width: 90, align: "right" });
        currentLine++;

        if (productSavings > 0) {
        doc.fillColor(discountColor)
            .text("Product Discount:", labelCol, summaryStart + currentLine * lineHeight)
            .text(`- ₹${productSavings.toFixed(2)}`, valueCol, summaryStart + currentLine * lineHeight, { width: 90, align: "right" });
        currentLine++;
        }

        const afterProductDiscount = totalOriginalValue - productSavings;
        doc.fillColor(textColor)
        .text("Total after Product Discounts:", labelCol, summaryStart + currentLine * lineHeight)
        .text(`₹${afterProductDiscount.toFixed(2)}`, valueCol, summaryStart + currentLine * lineHeight, { width: 90, align: "right" });
        currentLine++;

        if (couponDiscount > 0) {
        let displayCouponCode = couponCode;
        if (couponCode.length > 15) {
            displayCouponCode = couponCode.substring(0, 12) + "...";
        }

        doc.fillColor(secondaryColor)
            .font("Helvetica-Bold")
            .text(`Coupon (${displayCouponCode}):`, labelCol, summaryStart + currentLine * lineHeight)
            .text(`- ₹${couponDiscount.toFixed(2)}`, valueCol, summaryStart + currentLine * lineHeight, { width: 90, align: "right" });
        currentLine++;

        if (couponCode.length > 15) {
            doc.fillColor(textColor)
            .fontSize(8)
            .font("Helvetica")
            .text(`Coupon Code: ${couponCode}`, labelCol, summaryStart + currentLine * lineHeight - 5);
            currentLine++;
        }
        }

        currentLine++;

        const finalAmount = order.amountPaid || afterProductDiscount - couponDiscount;
        doc.fillColor(primaryColor)
        .fontSize(12)
        .font("Helvetica-Bold")
        .text("Grand Total:", labelCol, summaryStart + currentLine * lineHeight)
        .text(`₹${finalAmount.toFixed(2)}`, valueCol, summaryStart + currentLine * lineHeight, { width: 90, align: "right" });
        currentLine++;

        if (order.amountPaid && order.amountPaid !== finalAmount) {
        doc.fillColor(textColor)
            .fontSize(10)
            .font("Helvetica")
            .text("Amount Paid:", labelCol, summaryStart + currentLine * lineHeight)
            .text(`₹${order.amountPaid.toFixed(2)}`, valueCol, summaryStart + currentLine * lineHeight, { width: 90, align: "right" });
        currentLine++;

        const balance = finalAmount - order.amountPaid;
        if (balance > 0) {
            doc.fillColor(errorColor)
            .text("Balance Due:", labelCol, summaryStart + currentLine * lineHeight)
            .text(`₹${balance.toFixed(2)}`, valueCol, summaryStart + currentLine * lineHeight, { width: 90, align: "right" });
        }
        }

        const savingsSummaryY = summaryStart + currentLine * lineHeight + 20;
        if (totalSavings > 0) {
        doc.roundedRect(labelCol - 10, savingsSummaryY, 220, 30, 5).fill(lightColor);

        doc.fillColor(discountColor)
            .fontSize(11)
            .font("Helvetica-Bold")
            .text(`You saved ₹${totalSavings.toFixed(2)} on this order!`, labelCol, savingsSummaryY + 10);
        }

        const footerY = savingsSummaryY + 50;
        doc.fillColor(accentColor).fontSize(12).text("Thank you for your purchase!", 50, footerY, { align: "center" });

        doc.fillColor(textColor)
        .fontSize(9)
        .text("We appreciate your business. For any questions regarding this invoice, please contact our support team.", 50, footerY + 20, { align: "center" });

        doc.text("support@ryzobags.com | +91 9876543210 | www.ryzobags.com", 50, footerY + 40, { align: "center" });

        doc.moveTo(50, footerY + 60).lineTo(550, footerY + 60).strokeColor(lightColor).stroke();

        doc.fillColor(originalPriceColor)
        .fontSize(8)
        .text("This is a computer-generated invoice. No signature is required.", 50, footerY + 70, { align: "center" });

        doc.end();
    } catch (error) {
        console.error("Error generating invoice:", error);
        res.status(500).send("Failed to generate invoice");
    }
    },

    getWalletBalance: async (req, res) => {
        try {
            const balance = await orderController.getUserWalletBalance(req.user._id);
            res.json({ success: true, balance });
        } catch (error) {
            console.error('Error getting wallet balance:', error);
            res.status(500).json({ success: false, error: 'Failed to get wallet balance' });
        }
    },

    getWalletTransactions: async (req, res) => {
        try {
            const { page = 1, limit = 10 } = req.query;
            const transactions = await WalletTransaction
                .find({ userId: req.user._id })
                .sort({ createdAt: -1 })
                .limit(limit * 1)
                .skip((page - 1) * limit);

            const total = await WalletTransaction.countDocuments({ userId: req.user._id });
            
            res.json({
                success: true,
                transactions,
                totalPages: Math.ceil(total / limit),
                currentPage: page
            });
        } catch (error) {
            console.error('Error getting wallet transactions:', error);
            res.status(statusCode.INTERNAL_SERVER_ERROR).json({ success: false, error: 'Failed to get wallet transactions' });
        }
    }
};

module.exports = orderController;