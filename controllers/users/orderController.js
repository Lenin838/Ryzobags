const Order = require('../../models/order');
const Product = require('../../models/product');
const Address = require('../../models/address');
const User = require('../../models/User');
const WalletTransaction = require('../../models/wallet');
const PDFDocument = require('pdfkit');
const address = require('../../models/address');

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
            const { orderId, reason } = req.body;
            const order = await Order.findOne({ orderId, userId: req.user._id });

            if (!order) {
                return res.status(404).json({ error: "Order not found" });
            }

            if (!["pending", "processing"].includes(order.status)) {
                return res.status(400).json({ error: "Order cannot be cancelled" });
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
                        success: "Order cancelled successfully and refund credited to wallet",
                        orderId: order.orderId,
                        status: order.status,
                        refundAmount: refundAmount,
                        walletBalance: newBalance
                    });
                } catch (walletError) {
                    console.error('Wallet credit failed:', walletError);
                    res.json({ 
                        success: "Order cancelled successfully but refund failed. Please contact support.",
                        orderId: order.orderId,
                        status: order.status,
                        refundAmount: refundAmount,
                        walletError: true
                    });
                }
            } else {
                res.json({ 
                    success: "Order cancelled successfully",
                    orderId: order.orderId,
                    status: order.status
                });
            }
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: "Failed to cancel order" });
        }
    },

    cancelOrderItem: async (req, res) => {
        try {
            const { orderId, itemId, reason } = req.body;
            const order = await Order.findOne({ orderId, userId: req.user._id });

            if (!order) {
                return res.status(404).json({ error: "Order not found" });
            }

            if (!["pending", "processing"].includes(order.status)) {
                return res.status(400).json({ error: "Order items cannot be cancelled" });
            }

            const itemIndex = order.items.findIndex(item => item._id.toString() === itemId);
            
            if (itemIndex === -1) {
                return res.status(404).json({ error: "Item not found in order" });
            }

            const targetItem = order.items[itemIndex];

            if (!["pending", "processing"].includes(targetItem.status)) {
                return res.status(400).json({ error: "Item cannot be cancelled" });
            }

            const itemRefundAmount = (targetItem.itemSalePrice || 0) * (targetItem.quantity || 0);
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
                
                // order.totalAmount = Math.max(0, newSubtotal - newDiscount);
                // console.log("discountRatio",discountRatio)
                // console.log(order.totalAmount)
                // order.discount = newDiscount;
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

            let walletResponse = {};
            if (itemRefundAmount > 0 && order.paymentMethod==="razorpay") {
                try {
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
                // newTotal: order.totalAmount,
                activeItemsCount: activeItems.length,
                ...walletResponse
            });
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: "Failed to cancel item" });
        }
    },

    getOrderDetails: async (req, res) => {
    try {
        const order = await Order.findById(req.params.id)
            .populate("items.productId")
            .populate('address.address')
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

        console.log("Order details:", order.address.toString());

        let selectedAddress = null;
        
        try {
            const userAddressDoc = await Address.findOne({ userId: order.userId }).lean();
            console.log('User address document found:', userAddressDoc);
            
            if (userAddressDoc && userAddressDoc.address && Array.isArray(userAddressDoc.address)) {
                console.log('Address array length:', userAddressDoc.address.length);
                if (order.address) {
                    selectedAddress = userAddressDoc.address.find(addr => 
                        addr._id.toString() === order.address.toString()
                    );
                    console.log('Order-specific address found:', selectedAddress);
                }
                
                if (!selectedAddress) {
                    selectedAddress = userAddressDoc.address.find(addr => 
                        addr.isDefault === true && addr.status === 'active'
                    );
                    // console.log('Default address found:', selectedAddress);
                }
                
                if (!selectedAddress) {
                    selectedAddress = userAddressDoc.address.find(addr => addr.status === 'active');
                    // console.log('First active address found:', selectedAddress);
                }
                
                if (!selectedAddress && userAddressDoc.address.length > 0) {
                    selectedAddress = userAddressDoc.address[0];
                    // console.log('First available address used:',selectedAddress);
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
                // console.error(`Invalid price for item ${index} in order ${order.orderId}:`, item);
                item.itemSalePrice = 0;
            }
            if (typeof item.quantity !== "number") {
                // console.error(`Invalid quantity for item ${index} in order ${order.orderId}:`, item);
                item.quantity = 0;
            }
        });

        const activeItemsTotal = order.amountPaid
            // .reduce((sum, item) => {
            //     const price = typeof item.itemSalePrice === 'number' ? item.itemSalePrice : 0;
            //     const quantity = typeof item.quantity === 'number' ? item.quantity : 0;
            //     return sum + (price * quantity);
            // }, 0);

        console.log('Selected address for rendering:', selectedAddress);

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
                return res.status(401).json({ success: false, message: 'User not authenticated' });
            }
            
            const order = await Order.findOne({ _id: orderId, userId: userId });
            
            if (!order) {
                return res.status(404).json({ success: false, message: 'Order not found' });
            }
            
            if (!['delivered', 'shipped', 'processing'].includes(order.status.toLowerCase())) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Returns can only be requested for delivered, shipped, or processing orders' 
                });
            }
            
            const returnableItems = order.items.filter(item => 
                item.status !== 'cancelled' && 
                item.itemStatus !== 'return request' && 
                item.status !== 'return request'
            );
            
            if (returnableItems.length === 0) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'No items available for return in this order' 
                });
            }
            
            order.items.forEach(item => {
                if (item.status !== 'cancelled' && 
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
                message: 'Return request for entire order submitted successfully',
                returnedItemsCount: returnableItems.length
            });
            
        } catch (error) {
            console.error('Error processing entire order return request:', error);
            res.status(500).json({ 
                success: false, 
                message: 'Failed to process return request: ' + error.message 
            });
        }
    },

    returnOrderItem: async (req, res) => {
        try {
            const { orderId, productId, reason } = req.body;
            const userId = req.user?._id;
            
            if (!userId) {
                return res.status(401).json({ success: false, message: 'User not authenticated' });
            }
            
            const order = await Order.findOne({ _id: orderId, userId: userId }).populate('items.productId');
            
            if (!order) {
                return res.status(404).json({ success: false, message: 'Order not found' });
            }
            
            if (!['delivered', 'shipped'].includes(order.status.toLowerCase())) {
                return res.status(400).json({ 
                    success: false, 
                    message: `Returns can only be requested for delivered, shipped, or processing orders. Current status: ${order.status}` 
                });
            }
            
            const itemIndex = order.items.findIndex(item => {
                const itemProductId = item.productId._id ? item.productId._id.toString() : item.productId.toString();
                return itemProductId === productId.toString() && 
                       item.status !== 'cancelled' &&
                       item.itemStatus !== 'return request' &&
                       item.status !== 'return request';
            });
            
            if (itemIndex === -1) {
                return res.status(404).json({ 
                    success: false, 
                    message: 'Item not found or not eligible for return' 
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
                message: 'Return request submitted successfully',
                itemIndex: itemIndex
            });
            
        } catch (error) {
            console.error('Error processing return request:', error);
            res.status(500).json({ 
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
            return res.status(401).send('User not authenticated');
        }

        const order = await Order.findOne({ _id: orderId, userId: userId })
            .populate('items.productId');

        if (!order) {
            return res.status(404).send('Order not found');
        }

        const deliveredItems = order.items.filter(item => item.status === 'delivered');
        
        if (deliveredItems.length === 0) {
            return res.status(400).send('Invoice can only be downloaded for orders with delivered items');
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

        console.log('Order address field:', order.address);
        console.log('Order userId:', order.userId);
        
        let selectedAddress = null;
        
        try {
            const userAddressDoc = await Address.findOne({ userId: order.userId });
            console.log('User address document found:', !!userAddressDoc);
            
            if (userAddressDoc && userAddressDoc.address && Array.isArray(userAddressDoc.address)) {
                console.log('Address array length:', userAddressDoc.address.length);
                
                selectedAddress = userAddressDoc.address.find(addr => 
                    addr._id.toString() === order.address.toString()
                );
                
                if (!selectedAddress) {
                    selectedAddress = userAddressDoc.address.find(addr => addr.status === 'active');
                }
                
                if (!selectedAddress && userAddressDoc.address.length > 0) {
                    selectedAddress = userAddressDoc.address[0];
                }
                
                console.log('Selected address found:', selectedAddress);
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
        console.log("prop:)...........:",proportionalDiscount);
        console.log('deliveredS............>>):',deliveredSubtotal);
        console.log(totalOrderAmount);
        
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
            res.status(500).send('Failed to generate invoice');
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
            res.status(500).json({ success: false, error: 'Failed to get wallet transactions' });
        }
    }
};

module.exports = orderController;