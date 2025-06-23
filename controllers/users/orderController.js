const Order = require('../../models/order');
const Product = require('../../models/product');
const Address = require('../../models/address');
const User = require('../../models/User');
const WalletTransaction = require('../../models/wallet');
const PDFDocument = require('pdfkit');

const orderController = {
    // Helper function to generate unique transaction ID
    generateTransactionId: () => {
        return 'TXN' + Date.now() + Math.random().toString(36).substr(2, 9);
    },

    // Helper function to get user's current wallet balance
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

    // Helper function to credit wallet
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

    // POST /user/orders/cancel
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

            await order.save();

            if (refundAmount > 0) {
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
                
                order.totalAmount = Math.max(0, newSubtotal - newDiscount);
                order.discount = newDiscount;
            }

            await order.save();

            let walletResponse = {};
            if (itemRefundAmount > 0) {
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
                newTotal: order.totalAmount,
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
            const order = await Order.findById(req.params.id).populate("items.productId").lean();
            if (!order || order.userId.toString() !== req.user._id.toString()) {
                req.flash("error", "Order not found");
                return res.redirect("/user/profile?tab=orders");
            }

            if (!order.items || !Array.isArray(order.items)) {
                console.error(`Order ${order.orderId} has invalid items array:`, order.items);
                req.flash("error", "Invalid order data");
                return res.redirect("/user/profile?tab=orders");
            }

            order.items.forEach((item, index) => {
                if (!item.status) {
                    item.status = order.status === "cancelled" ? "cancelled" : "active";
                }
                if (typeof item.itemSalePrice !== "number") {
                    console.error(`Invalid price for item ${index} in order ${order.orderId}:`, item);
                }
            });

            const activeItemsTotal = order.items
                .filter(item => item.status !== "cancelled")
                .reduce((sum, item) => sum + (typeof item.itemSalePrice === 'number' ? item.itemSalePrice * item.quantity : 0), 0);

            res.render("user/orderDetails", {
                order,
                activeItemsTotal,
                activeTab: "orders",
                success: req.flash("success"),
                error: req.flash("error"),
            });
        } catch (err) {
            console.error(err);
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
            
            if (!['delivered', 'shipped', 'processing'].includes(order.status.toLowerCase())) {
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

            if (order.status !== 'delivered') {
                return res.status(400).send('Invoice can only be downloaded for delivered orders');
            }

            const doc = new PDFDocument({ margin: 50 });
            let buffers = [];

            doc.on('data', buffers.push.bind(buffers));
            doc.on('end', () => {
                const pdfData = Buffer.concat(buffers);
                res.setHeader('Content-Disposition', `attachment; filename=invoice-${order.orderId}.pdf`);
                res.contentType('application/pdf');
                res.send(pdfData);
            });

            doc
                .fontSize(20)
                .text('INVOICE', { align: 'center' })
                .moveDown();

            doc
                .fontSize(12)
                .text('RYZO BAGS', { align: 'left' })
                .text('123 Store Street, City, India')
                .text('ZIP: 123456')
                .moveDown();

            const address = order.address || {};
            doc
                .text(`Bill To: ${address.name || 'N/A'}`)
                .text(`${address.landMark || ''}, ${address.city || 'N/A'}`)
                .text(`Pincode: ${address.pincode || 'N/A'}`)
                .moveDown();

            doc
                .text(`Invoice Number: ${order.orderId}`)
                .text(`Invoice Date: ${new Date(order.createdAt).toLocaleDateString()}`)
                .moveDown();

            doc
                .font('Helvetica-Bold')
                .text('Product', 50)
                .text('Qty', 250)
                .text('Price', 300)
                .text('Total', 400)
                .moveDown();

            doc.font('Helvetica');
            order.items.forEach(item => {
                const totalPrice = item.quantity * item.itemSalePrice;
                doc
                    .text(item.productId.name, 50)
                    .text(item.quantity.toString(), 250)
                    .text(`₹${item.itemSalePrice}`, 300)
                    .text(`₹${totalPrice}`, 400)
                    .moveDown();
            });

            doc
                .moveDown()
                .font('Helvetica-Bold')
                .text(`Subtotal: ₹${order.totalAmount}`, { align: 'right' });

            if (order.discount > 0) {
                doc.text(`Discount: ₹${order.discount}`, { align: 'right' });
            }

            doc.text(`Grand Total: ₹${order.totalAmount - (order.discount || 0)}`, { align: 'right' });

            doc
                .moveDown()
                .fontSize(10)
                .font('Helvetica-Oblique')
                .text('Thank you for shopping with us!', { align: 'center' });

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