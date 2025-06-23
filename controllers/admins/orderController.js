const Order = require('../../models/order');
const User = require('../../models/User');
const Product = require('../../models/Product');
const WalletTransaction = require('../../models/wallet');
const nodemailer = require('nodemailer');

// Nodemailer configuration
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
  // GET /admin/orders
  getOrders: async (req, res) => {
    try {
      const {
        search = '',
        sort = 'orderDate',
        order = 'desc',
        status = '',
        page = 1,
      } = req.query;
      const limit = 10;
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

      res.render('admin/order', {
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

  // GET /admin/orders/view/:orderId
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

  // POST /admin/orders/update-status/:orderId
  updateOrderStatus: async (req, res) => {
    try {
      const { orderId } = req.params;
      const { status } = req.body;

      const validStatuses = ['pending', 'processing', 'shipped', 'delivered', 'cancelled', 'return request', 'returned', 'failed'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ message: 'Invalid status' });
      }

      const order = await Order.findOne({ orderId }).populate('items.productId');
      if (!order) {
        return res.status(404).json({ message: 'Order not found' });
      }

      const previousStatus = order.status;

      // Validate stock for shipped status
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

      // Update order and item statuses
      order.status = status;
      order.items.forEach((item) => {
        if (['pending', 'processing', 'shipped'].includes(status)) {
          item.status = status;
        } else if (status === 'delivered') {
          item.status = 'delivered';
          order.deliveredDate = order.deliveredDate || new Date();
        } else if (status === 'cancelled') {
          item.status = 'cancelled';
        } else if (status === 'return request' || status === 'returned') {
          item.status = status;
        }
      });

      await order.save();

      // Update inventory
      if (status === 'shipped' && previousStatus !== 'shipped') {
        for (const item of order.items) {
          await Product.findByIdAndUpdate(item.productId, {
            $inc: { 'variants.$[variant].quantity': -item.quantity },
          }, {
            arrayFilters: [{ 'variant.size': item.size }],
          });
        }
      } else if (status === 'cancelled' && previousStatus !== 'delivered' && previousStatus !== 'returned') {
        for (const item of order.items) {
          await Product.findByIdAndUpdate(item.productId, {
            $inc: { 'variants.$[variant].quantity': item.quantity },
          }, {
            arrayFilters: [{ 'variant.size': item.size }],
          });
        }
        // Credit wallet for cancellation
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

        // Send cancellation email
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

  // POST /admin/orders/verify-return/:orderId
 // POST /admin/orders/verify-return/:orderId - COMPLETE FIXED VERSION
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

    // Check if order is eligible for return processing
    if (!['delivered', 'return request'].includes(order.status)) {
      return res.status(400).json({ 
        message: `Order not eligible for return. Current status: ${order.status}` 
      });
    }

    // Initialize returnRequest if it doesn't exist
    if (!order.returnRequest) {
      order.returnRequest = {
        isRequested: false,
        reason: '',
        requestedAt: null,
        processedAt: null
      };
    }

    if (action === 'approve') {
      order.status = 'returned';
      order.items.forEach((item) => {
        item.status = 'returned';
        if (item.requestQuantity !== undefined) {
          item.requestQuantity = 0;
        }
      });
      
      order.returnRequest.isRequested = false;
      order.returnRequest.processedAt = new Date();

      // Restore inventory
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

      // Credit wallet - FIXED VERSION
      try {
        const lastTx = await WalletTransaction.findOne({ userId: order.userId })
          .sort({ createdAt: -1 })
          .lean();
        
        const currentBalance = lastTx ? lastTx.wallet.balance : 0;
        const refundAmount = order.amountPaid || order.totalAmount;

        // Generate a unique transaction ID
        const transactionId = `REF_${orderId}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

        const newTransaction = new WalletTransaction({
          userId: order.userId,
          transactionId: transactionId,
          productId: orderId, // Using order ID as productId since it's required
          amount: refundAmount,
          type: 'refund',
          status: 'success',
          reference: orderId,
          description: `Refund for returned order ${orderId}`,
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

        // Send return approval email
        try {
          const user = await User.findById(order.userId);
          if (user && user.email) {
            await transporter.sendMail({
              from: `"RyzoBags" <${process.env.ADMIN_EMAIL}>`,
              to: user.email,
              subject: 'Order Return Approved - RyzoBags',
              html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                  <h2 style="color: #059669;">Order Return Approved</h2>
                  <p>Your return request for order <strong>${orderId}</strong> has been approved, and a refund of <strong>$${refundAmount}</strong> has been credited to your wallet.</p>
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

    } else { // reject
      order.status = 'delivered';
      order.items.forEach((item) => {
        item.status = 'delivered';
        if (item.requestQuantity !== undefined) {
          item.requestQuantity = 0;
        }
      });
      
      order.returnRequest.isRequested = false;
      order.returnRequest.processedAt = new Date();

      // Send return rejection email
      try {
        const user = await User.findById(order.userId);
        if (user && user.email) {
          await transporter.sendMail({
            from: `"RyzoBags" <${process.env.ADMIN_EMAIL}>`,
            to: user.email,
            subject: 'Order Return Rejected - RyzoBags',
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <h2 style="color: #dc2626;">Order Return Rejected</h2>
                <p>Your return request for order <strong>${orderId}</strong> has been rejected. Please contact support for more details.</p>
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
      message: `Return request ${action}d successfully`,
      newStatus: order.status 
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