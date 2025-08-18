const Order = require('../../models/order');
const Product = require('../../models/product');
const Address = require('../../models/address');
const User = require('../../models/User');
const WalletTransaction = require('../../models/wallet');
const PDFDocument = require('pdfkit');
const address = require('../../models/address');
const nodemailer = require('nodemailer');
const sendOtpEmail = require('../../controllers/users/otpService');
const template = require('../../controllers/users/emailTemplates');
const statusCode = require('../../config/statusCode');
const message = require('../../config/messages');

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
            
            const { orderId,itemId, reason } = req.body;
            const order = await Order.findOne({ orderId, userId: req.user._id });

            if (!order) {
                return res.status(statusCode.NOT_FOUND).json({ error: message.ORDER_NOT_FOUND });
            }

            if (!["pending", "processing"].includes(order.status)) {
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

            let itemRefundAmount = (targetItem.itemSalePrice || 0) * (targetItem.quantity || 0);
            const productId = targetItem.productId.toString();

            targetItem.status = "cancelled";
            targetItem.cancelReason = reason || "Item cancelled by user";
            targetItem.cancelledAt = new Date();

            const activeItems = order.items.filter(item => item.status !== "cancelled");
            
            if (activeItems.length === 0) {
                order.status = "cancelled";
                order.cancelReason = "All items cancelled";
                order.cancelledAt = new Date();
            } else {
                const newSubtotal = activeItems.reduce((sum, item) => {
                    const itemPrice = typeof item.itemSalePrice === 'number' ? item.itemSalePrice : 0;
                    const itemQuantity = typeof item.quantity === 'number' ? item.quantity : 0;
                    return sum + (itemPrice * itemQuantity);
                }, 0);
                
                const originalSubtotal = order.items.reduce((sum, item) => {
                    const itemPrice = typeof item.itemSalePrice === 'number' ? item.itemSalePrice : 0;
                    const itemQuantity = typeof item.quantity === 'number' ? item.quantity : 0;
                    return sum + (itemPrice * itemQuantity);
                }, 0);
                
                const discountRatio = originalSubtotal > 0 ? (order.discount || 0) / originalSubtotal : 0;
                const newDiscount = newSubtotal * discountRatio;
                
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
            if (itemRefundAmount > 0 && order.paymentMethod==="razorpay") {
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
                success: message.ITEM_CANCEL_SUCCESS_REFUND,
                orderId: order.orderId,
                itemId: targetItem._id,
                orderStatus: order.status,
                activeItemsCount: activeItems.length,
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
            .populate('address.address')
            .lean();

        if (!order || order.userId.toString() !== req.user._id.toString()) {
            req.flash("error", message.ORDER_NOT_FOUND);
            return res.redirect("/user/profile?tab=orders");
        }

        if (!order.items || !Array.isArray(order.items)) {
            console.error(`Order ${order.orderId} has invalid items array:`, order.items);
            req.flash("error", message.INVALID_ORDER);
            return res.redirect("/user/profile?tab=orders");
        }


        let selectedAddress = null;
        
        try {
            const userAddressDoc = await Address.findOne({ userId: order.userId }).lean();
            
            if (userAddressDoc && userAddressDoc.address && Array.isArray(userAddressDoc.address)) {
                if (order.address) {
                    selectedAddress = userAddressDoc.address.find(addr => 
                        addr._id.toString() === order.address.toString()
                    );
                }
                
                if (!selectedAddress) {
                    selectedAddress = userAddressDoc.address.find(addr => 
                        addr.isDefault === true && addr.status === 'active'
                    );
                }
                
                if (!selectedAddress) {
                    selectedAddress = userAddressDoc.address.find(addr => addr.status === 'active');
                }
                
                if (!selectedAddress && userAddressDoc.address.length > 0) {
                    selectedAddress = userAddressDoc.address[0];
                }
            }
        } catch (addressError) {
            console.error('Error fetching user address:', addressError);
        }

        order.items.forEach((item, index) => {
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

        const activeItemsTotal = order.amountPaid
           

        res.render("user/orderDetails", {
            order,
            selectedAddress,
            activeItemsTotal,
            activeTab: "orders",
            success: req.flash("success"),
            error: req.flash("error"),
        });

        } catch (err) {
            console.error('Error in getOrderDetails:', err);
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
            .populate('items.productId');

        if (!order) {
            return res.status(statusCode.NOT_FOUND).send({message: message.ORDER_NOT_FOUND});
        }

        const deliveredItems = order.items.filter(item => item.status === 'delivered');
        
        if (deliveredItems.length === 0) {
            return res.status(statusCode.BAD_REQUEST).send({message: message.INVOICE_NOT_AVAILABLE});
        }

        const doc = new PDFDocument({ 
            margin: 50,
            size: 'A4',
            bufferPages: true
        });
        
        let buffers = [];
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => {
            const pdfData = Buffer.concat(buffers);
            res.setHeader('Content-Disposition', `attachment; filename=invoice-${order.orderId}.pdf`);
            res.contentType('application/pdf');
            res.send(pdfData);
        });

        const primaryColor = '#4F46E5'; 
        const secondaryColor = '#10B981'; 
        const accentColor = '#F59E0B'; 
        const textColor = '#374151'; 
        const lightColor = '#F3F4F6'; 

        doc
            .fillColor(primaryColor)
            .fontSize(20)
            .text('RYZO BAGS', { align: 'left' })
            .moveDown(0.5);
        
        doc
            .fillColor(textColor)
            .fontSize(10)
            .text('123 Store Street, City, India', { align: 'left' })
            .text('ZIP: 123456 | Phone: +91 9876543210')
            .text('Email: support@ryzobags.com | Web: www.ryzobags.com')
            .moveDown(1);

        doc
            .fillColor(primaryColor)
            .fontSize(18)
            .text('TAX INVOICE', { align: 'center', underline: true })
            .moveDown(1);

        const col1 = 50;
        const col2 = 300;
        
        doc
            .fillColor(textColor)
            .fontSize(10)
            .text('Invoice Number:', col1, 180)
            .text(order.orderId, col1 + 80, 180)
            .text('Invoice Date:', col1, 195)
            .text(new Date(order.orderDate).toLocaleDateString(), col1 + 80, 195)
            .text('Order Date:', col1, 210)
            .text(new Date(order.orderDate).toLocaleDateString(), col1 + 80, 210)
            .text('Payment Method:', col1, 225)
            .text(order.paymentMethod || 'N/A', col1 + 80, 225);

        
        let selectedAddress = null;
        
        try {
            const userAddressDoc = await Address.findOne({ userId: order.userId });
            
            if (userAddressDoc && userAddressDoc.address && Array.isArray(userAddressDoc.address)) {
                
                selectedAddress = userAddressDoc.address.find(addr => 
                    addr._id.toString() === order.address.toString()
                );
                
                if (!selectedAddress) {
                    selectedAddress = userAddressDoc.address.find(addr => addr.status === 'active');
                }
                
                if (!selectedAddress && userAddressDoc.address.length > 0) {
                    selectedAddress = userAddressDoc.address[0];
                }
                
            }
        } catch (addressError) {
            console.error('Error fetching user address:', addressError);
        }

        doc
            .fillColor(primaryColor)
            .fontSize(12)
            .text('Bill To:', col2, 180, { underline: true })
            .fillColor(textColor)
            .fontSize(10);

        if (selectedAddress) {
            doc
                .text(selectedAddress.name || 'N/A', col2, 195)
                .text(`${selectedAddress.landMark || ''}, ${selectedAddress.city || 'N/A'}`, col2, 210)
                .text(`${selectedAddress.state || 'N/A'} - ${selectedAddress.pincode || 'N/A'}`, col2, 225)
                .text(`Phone: ${selectedAddress.phone || 'N/A'}`, col2, 240);
            
            if (selectedAddress.altPhone) {
                doc.text(`Alt Phone: ${selectedAddress.altPhone}`, col2, 255);
            }
            if (selectedAddress.addressType) {
                doc.text(`Type: ${selectedAddress.addressType}`, col2, 270);
            }
        } else {
            doc.text('Address not available', col2, 195);
        }

        doc.moveDown(2);
        const tableTop = 320; 
        
        doc
            .fillColor(lightColor)
            .rect(50, tableTop, 500, 20)
            .fill()
            .fillColor(primaryColor)
            .fontSize(10)
            .font('Helvetica-Bold')
            .text('Product', 50, tableTop + 5)
            .text('Size', 200, tableTop + 5)
            .text('Qty', 250, tableTop + 5)
            .text('Unit Price', 300, tableTop + 5)
            .text('Amount', 450, tableTop + 5, { width: 100, align: 'right' });

        let tablePosition = tableTop + 25;
        doc.fillColor(textColor).font('Helvetica');
        
        let deliveredSubtotal = 0;
        deliveredItems.forEach((item, index) => {
            const rowY = tablePosition + (index * 25);
            const totalPrice = item.quantity * item.itemSalePrice;
            deliveredSubtotal += totalPrice;
            
            if (index % 2 === 0) {
                doc.fillColor(lightColor).rect(50, rowY - 5, 500, 20).fill();
            } else {
                doc.fillColor('#FFFFFF').rect(50, rowY - 5, 500, 20).fill();
            }
            
            doc
                .fillColor(textColor)
                .fontSize(10)
                .text(item.productId.name || 'N/A', 50, rowY)
                .text(item.size || 'N/A', 200, rowY)
                .text(item.quantity.toString(), 250, rowY)
                .text(`₹${item.itemSalePrice.toFixed(2)}`, 300, rowY)
                .text(`₹${totalPrice.toFixed(2)}`, 450, rowY, { width: 100, align: 'right' });
        });

        const summaryTop = tablePosition + (deliveredItems.length * 25) + 20;
        
        const totalOrderAmount = order.items.reduce((sum, item) => sum + (item.quantity * item.itemSalePrice), 0);
        const proportionalDiscount = order.discount || 0;
        
        doc
            .fillColor(secondaryColor)
            .fontSize(12)
            .text('Subtotal:', 350, summaryTop)
            .text(`₹${deliveredSubtotal.toFixed(2)}`, 450, summaryTop, { width: 100, align: 'right' });
        
        if (proportionalDiscount > 0) {
            doc
                .text('Discount:', 350, summaryTop + 20)
                .text(`- ₹${proportionalDiscount.toFixed(2)}`, 450, summaryTop + 20, { width: 100, align: 'right' });
        }

        const finalAmount = deliveredSubtotal - proportionalDiscount;
        doc
            .fillColor(primaryColor)
            .fontSize(14)
            .font('Helvetica-Bold')
            .text('Grand Total:', 350, summaryTop + 40)
            .text(`₹${finalAmount.toFixed(2)}`, 450, summaryTop + 40, { width: 100, align: 'right' });

        doc
            .moveDown(1)
            .fillColor(accentColor)
            .fontSize(9)
            .text('Note: This invoice includes only delivered items', { align: 'center' })
            .moveDown(0.5);

        doc
            .fillColor(accentColor)
            .fontSize(10)
            .text('Thank you for shopping with us!', { align: 'center' })
            .moveDown(0.5)
            .fillColor(textColor)
            .text('For any queries, please contact support@ryzobags.com', { align: 'center' })
            .text('Terms & Conditions apply', { align: 'center' });

        doc
            .strokeColor(lightColor)
            .lineWidth(20)
            .moveTo(0, doc.page.height - 50)
            .lineTo(doc.page.width, doc.page.height - 50)
            .stroke();

        doc.end();
        } catch (error) {
            console.error('Error generating invoice:', error);
            res.status(statusCode.INTERNAL_SERVER_ERROR).send('Failed to generate invoice');
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