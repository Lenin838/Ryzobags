const Order = require('../../models/order');
const User = require('../../models/User');
const Product = require('../../models/product');
const WalletTransaction = require('../../models/wallet');
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.ADMIN_EMAIL,
    pass: process.env.ADMIN_EMAIL_APP_PASS,
  },
  tls: { rejectUnauthorized: false },
  logger: true,
  debug: true,
});

const adminOrderController = {
    getOrders: async (req, res) => {
      try {
        const {
          search = '',
          sort = 'orderDate',
          order = 'desc',
          status = '',
          page = 1,
        } = req.query;
        const limit = 6;
        const skip = (page - 1) * limit;

        let query = {};
        if (search) {
          const users = await User.find({
            $or: [
              { fullname: { $regex: search, $options: 'i' } },
              { email: { $regex: search, $options: 'i' } },
            ],
          }).select('_id');
          const userIds = users.map((user) => user._id);
          query = {
            $or: [
              { orderId: { $regex: search, $options: 'i' } },
              { userId: { $in: userIds } },
            ],
          };
        }
        if (status) {
          query.status = status;
        }

        const sortOptions = {};
        sortOptions[sort] = order === 'desc' ? -1 : 1;

        const orders = await Order.find(query)
          .populate('userId', 'fullname email')
          .sort(sortOptions)
          .skip(skip)
          .limit(limit)
          .lean();

        const totalOrders = await Order.countDocuments(query);
        const totalPages = Math.ceil(totalOrders / limit);

        res.render('admin/layout', {
          body: 'order',
          orders,
          currentPage: parseInt(page),
          totalPages,
          totalOrders,
          searchQuery: search,
          sort,
          order,
          status,
          success: req.flash('success'),
          error: req.flash('error'),
        });
      } catch (err) {
        console.error('Error in getOrders:', err);
        req.flash('error', 'Unable to load orders');
        res.status(500).render('admin/orders', {
          orders: [],
          currentPage: 1,
          totalPages: 0,
          totalOrders: 0,
          searchQuery: '',
          sort: 'orderDate',
          order: 'desc',
          status: '',
          error: req.flash('error'),
        });
      }
    },
    viewOrder: async (req, res) => {
      try {
        const { orderId } = req.params;
        const order = await Order.findOne({ orderId })
          .populate('userId', 'fullname email')
          .populate('items.productId', 'name')
          .lean();

        if (!order) {
          req.flash('error', 'Order not found');
          return res.redirect('/admin/orders');
        }

        res.render('admin/orderDetail', {
          order,
          csrfToken: req.csrfToken ? req.csrfToken() : '',
          success: req.flash('success'),
          error: req.flash('error'),
        });
      } catch (err) {
        console.error('Error in viewOrder:', err);
        req.flash('error', 'Unable to load order details');
        res.redirect('/admin/orders');
      }
    },
    updateOrderStatus: async (req, res) => {
      try {
        const { orderId } = req.params;
        const { status } = req.body;

        const validStatuses = ['pending', 'processing', 'shipped', 'delivered', 'cancelled', 'return request', 'returned',"partially returned", 'failed'];
        if (!validStatuses.includes(status)) {
          return res.status(400).json({ message: 'Invalid status' });
        }

        const order = await Order.findOne({ orderId }).populate('items.productId');
        if (!order) {
          return res.status(404).json({ message: 'Order not found' });
        }

        const previousStatus = order.status;

        if (status === 'shipped' && previousStatus !== 'shipped') {
          for (const item of order.items) {
            const product = item.productId;
            if (!product) {
              return res.status(404).json({ message: `Product not found for item` });
            }
            const variant = product.variants.find((v) => v.size === item.size);
            if (!variant) {
              return res.status(404).json({ message: `Variant ${item.size} not found for ${product.name}` });
            }
            if (variant.quantity < item.quantity) {
              return res.status(400).json({
                message: `Insufficient stock for ${product.name} (Size: ${item.size}). Available: ${variant.quantity}, Required: ${item.quantity}`,
              });
            }
          }
        }
        
        order.status = status;
        
        order.items.forEach((item) => {
          if (['pending', 'processing', 'shipped'].includes(status)) {
            if (item.status !== 'cancelled' && item.status !== 'returned') {
              item.status = status;
            }
          } else if (status === 'delivered') {
            if (item.status !== 'cancelled' && item.status !== 'returned') {
              item.status = 'delivered';
            }
            order.deliveredDate = order.deliveredDate || new Date();
          } else if (status === 'cancelled') {
            item.status = 'cancelled';
          } else if (status === 'return request' || status === 'returned') {
            item.status = status;
          }
        });

        await order.save();

        if (status === 'shipped' && previousStatus !== 'shipped') {
          for (const item of order.items) {
            if (item.status !== 'cancelled' && item.status !== 'returned') {
              await Product.findByIdAndUpdate(item.productId, {
                $inc: { 'variants.$[variant].quantity': -item.quantity },
              }, {
                arrayFilters: [{ 'variant.size': item.size }],
              });
            }
          }
        } else if (status === 'cancelled' && previousStatus !== 'delivered' && previousStatus !== 'returned') {
          for (const item of order.items) {
            await Product.findByIdAndUpdate(item.productId, {
              $inc: { 'variants.$[variant].quantity': item.quantity },
            }, {
              arrayFilters: [{ 'variant.size': item.size }],
            });
          }
          const lastTx = await WalletTransaction.findOne({ userId: order.userId })
            .sort({ createdAt: -1 })
            .lean();
          const currentBalance = lastTx ? lastTx.wallet.balance : 0;

          const newTransaction = new WalletTransaction({
            userId: order.userId,
            amount: order.amountPaid || order.totalAmount,
            type: 'credit',
            description: `Refund for cancelled order ${orderId}`,
            wallet: {
              balance: currentBalance + (order.amountPaid || order.totalAmount),
            },
            createdAt: new Date(),
          });
          await newTransaction.save();

          try {
            const user = await User.findById(order.userId);
            await transporter.sendMail({
              from: `"RyzoBags" <${process.env.ADMIN_EMAIL}>`,
              to: user.email,
              subject: 'Order Cancellation Refund - RyzoBags',
              html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                  <h2 style="color: #dc2626;">Order Cancelled</h2>
                  <p>Your order <strong>${orderId}</strong> has been cancelled, and a refund of <strong>$${order.amountPaid || order.totalAmount}</strong> has been credited to your wallet.</p>
                  <p>Current wallet balance: <strong>$${newTransaction.wallet.balance}</strong></p>
                  <p style="margin-top: 30px; color: #6b7280;">
                    Best regards,<br>
                    RyzoBags Team
                  </p>
                </div>
              `,
            });
          } catch (emailError) {
            console.error('Failed to send cancellation email:', emailError);
          }
        }

        return res.json({ message: `Order status updated to ${status}` });
      } catch (err) {
        console.error('Error in updateOrderStatus:', err);
        return res.status(500).json({ message: 'Error updating order status' });
      }
    },
    verifyReturnRequest: async (req, res) => {
    try {
      const { orderId } = req.params;
      const { action } = req.body;

      console.log('Processing return request:', { orderId, action });

      if (!['approve', 'reject'].includes(action)) {
        return res.status(400).json({ message: 'Invalid action' });
      }

      const order = await Order.findOne({ orderId }).populate('items.productId');
      
      if (!order) {
        console.log('Order not found:', orderId);
        return res.status(400).json({ message: 'Order not found' });
      }

      console.log('Order status:', order.status);

      if (!['delivered', 'return request'].includes(order.status)) {
        return res.status(400).json({ 
          message: `Order not eligible for return. Current status: ${order.status}` 
        });
      }

      const targetItems = order.items.filter(item => 
        item.status === 'return request' || 
        (item.requestQuantity !== undefined && item.requestQuantity > 0)
      );

      if (targetItems.length === 0) {
        return res.status(400).json({ message: 'No items found with return requests' });
      }

      console.log(`Found ${targetItems.length} items with return requests`);
      if (!order.returnRequest) {
        order.returnRequest = {
          isRequested: false,
          reason: '',
          requestedAt: null,
          processedAt: null
        };
      }

      if (action === 'approve') {
        targetItems.forEach((item) => {
          item.status = 'returned';
          if (item.requestQuantity !== undefined) {
            item.requestQuantity = 0;
          }
        });

        const allItemsReturned = order.items.every(item => item.status === 'returned');
        const hasReturnedItems = order.items.some(item => item.status === 'returned');
        const hasDeliveredItems = order.items.some(item => item.status === 'delivered');
        
        if (allItemsReturned) {
          order.status = 'returned';
        } else if (hasReturnedItems && hasDeliveredItems) {
          order.status = 'partially returned';
        } else {
          order.status = 'delivered';
        }
        
        order.returnRequest.isRequested = false;
        order.returnRequest.processedAt = new Date();

        for (const item of targetItems) {
          if (item.productId && item.size) {
            try {
              await Product.findByIdAndUpdate(item.productId._id || item.productId, {
                $inc: { 'variants.$[variant].quantity': item.quantity },
              }, {
                arrayFilters: [{ 'variant.size': item.size }],
              });
              console.log(`Inventory restored for item: ${item.productId._id || item.productId}, size: ${item.size}, quantity: ${item.quantity}`);
            } catch (inventoryError) {
              console.error('Error updating inventory:', inventoryError);
            }
          }
        }

        const refundAmount = targetItems.reduce((total, item) => {
          const itemPrice = item.itemSalePrice || (order.totalAmount / order.items.reduce((sum, i) => sum + i.quantity, 0));
          return total + (itemPrice * item.quantity);
        }, 0);

        try {
          const lastTx = await WalletTransaction.findOne({ userId: order.userId })
            .sort({ createdAt: -1 })
            .lean();
          
          const currentBalance = lastTx ? lastTx.wallet.balance : 0;

          const transactionId = `REF_${orderId}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

          const newTransaction = new WalletTransaction({
            userId: order.userId,
            transactionId: transactionId,
            productId: orderId,
            amount: refundAmount,
            type: 'refund',
            status: 'success',
            reference: orderId,
            description: `Refund for returned items in order ${orderId}`,
            wallet: {
              balance: currentBalance + refundAmount,
              lastUpdated: new Date()
            },
            createdAt: new Date(),
          });

          await newTransaction.save();
          console.log('Wallet credited successfully:', {
            transactionId,
            amount: refundAmount,
            newBalance: currentBalance + refundAmount
          });

          try {
            const user = await User.findById(order.userId);
            if (user && user.email) {
              const returnedItemsDetails = targetItems.map(item => 
                `${item.productId.name || 'Product'} (${item.size}) - Qty: ${item.quantity}`
              ).join('<br>');

              await transporter.sendMail({
                from: `"RyzoBags" <${process.env.ADMIN_EMAIL}>`,
                to: user.email,
                subject: 'Order Return Approved - RyzoBags',
                html: `
                  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                    <h2 style="color: #059669;">Order Return Approved</h2>
                    <p>Your return request for the following items in order <strong>${orderId}</strong> has been approved:</p>
                    <div style="background-color: #f3f4f6; padding: 15px; margin: 15px 0; border-radius: 5px;">
                      ${returnedItemsDetails}
                    </div>
                    <p>A refund of <strong>$${refundAmount}</strong> has been credited to your wallet.</p>
                    <p>Current wallet balance: <strong>$${newTransaction.wallet.balance}</strong></p>
                    <p>Transaction ID: <strong>${transactionId}</strong></p>
                    <p style="margin-top: 30px; color: #6b7280;">
                      Best regards,<br>
                      RyzoBags Team
                    </p>
                  </div>
                `,
              });
            }
          } catch (emailError) {
            console.error('Failed to send return approval email:', emailError);
          }

        } catch (walletError) {
          console.error('Error processing wallet transaction:', walletError);
          
          if (walletError.code === 11000) {
            return res.status(500).json({ 
              message: 'Transaction ID conflict. Please try again.' 
            });
          }
          
          return res.status(500).json({ 
            message: 'Error processing refund. Please try again.',
            error: process.env.NODE_ENV === 'development' ? walletError.message : undefined
          });
        }

      } else { 
        targetItems.forEach((item) => {
          item.status = 'delivered';
          if (item.requestQuantity !== undefined) {
            item.requestQuantity = 0;
          }
        });

        const hasOtherReturnRequests = order.items.some(item => 
          !targetItems.includes(item) && item.status === 'return request'
        );

        if (!hasOtherReturnRequests) {
          order.status = 'delivered';
          order.returnRequest.isRequested = false;
          order.returnRequest.processedAt = new Date();
        }

        try {
          const user = await User.findById(order.userId);
          if (user && user.email) {
            const rejectedItemsDetails = targetItems.map(item => 
              `${item.productId.name || 'Product'} (${item.size}) - Qty: ${item.quantity}`
            ).join('<br>');

            await transporter.sendMail({
              from: `"RyzoBags" <${process.env.ADMIN_EMAIL}>`,
              to: user.email,
              subject: 'Order Return Rejected - RyzoBags',
              html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                  <h2 style="color: #dc2626;">Order Return Rejected</h2>
                  <p>Your return request for the following items in order <strong>${orderId}</strong> has been rejected:</p>
                  <div style="background-color: #f3f4f6; padding: 15px; margin: 15px 0; border-radius: 5px;">
                    ${rejectedItemsDetails}
                  </div>
                  <p>Please contact support for more details.</p>
                  <p style="margin-top: 30px; color: #6b7280;">
                    Best regards,<br>
                    RyzoBags Team
                  </p>
                </div>
              `,
            });
          }
        } catch (emailError) {
          console.error('Failed to send return rejection email:', emailError);
        }
      }

      await order.save();
      console.log('Order saved successfully');
      
      return res.json({ 
        message: `Return request ${action}d successfully for ${targetItems.length} item(s)`,
        newStatus: order.status,
        processedItems: targetItems.length,
        returnedItems: targetItems.map(item => ({
          productId: item.productId._id || item.productId,
          size: item.size,
          quantity: item.quantity
        }))
      });

    } catch (err) {
      console.error('Error in verifyReturnRequest:', err);
      return res.status(500).json({ 
        message: 'Error processing return request',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
      });
    }
  },
};

module.exports = adminOrderController;