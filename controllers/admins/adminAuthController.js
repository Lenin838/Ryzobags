const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const Admin = require('../../models/Admin');
const User = require('../../models/User');
const statusCode = require('../../config/statusCode');
const message = require('../../config/messages');


const adminController = {
  loadLoginPage: async (req, res) => {
    try {
      res.render('admin/login');
    } catch (error) {
      console.error('Error loading login page:', error.message);
    }
  },

  verifyLogin: async (req, res) => {
    try {
      const { email, password } = req.body;
      const errors = {};

      if (!email || email.trim() === '') {
        errors.email = message.EMAIL_REQUIRED;
      } else if (!/^[^\s@]+@[^\s@]+$/.test(email)) {
        errors.email = message.INVALID_EMAIL;
      }

      if (!password || password.trim() === '') {
        errors.password = 'Password is required.';
      }

      if (Object.keys(errors).length > 0) {
        return res.status(statusCode.BAD_REQUEST).json({ success: false, errors });
      }

      const admin = await Admin.findOne({ email });
      if (!admin) {
        return res.status(statusCode.NOT_FOUND).json({ success: false, message: message.ADMIN_NOT_FOUND});
      }

      const isMatch = await bcrypt.compare(password, admin.password);
      if (!isMatch) {
        return res.status(statusCode.UNAUTHORIZED).json({ success: false, message: 'Invalid credentials.' });
      }

      req.session.admin = admin;
      return res.status(statusCode.OK).json({ success: true, message: message.LOGIN_SUCCESS  });

    } catch (error) {
      console.error('Admin login error:', error.message);
      res.status(statusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message.SERVER_ERROR });
    }
  },

  adminLogout: async (req, res) => {
    try {
      req.session.destroy(() => {
        res.redirect('/admin/login');
      });
    } catch (error) {
      console.error('Admin logout error:', error.message);
      res.status(statusCode.INTERNAL_SERVER_ERROR).json({ message: message.SERVER_ERROR });
    }
  },

  getUsers: async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 3;
        const skip = (page - 1) * limit;
        const searchQuery = req.query.search || '';

        let query = {};
        if (searchQuery) {
            query.$or = [
                { fullname: { $regex: searchQuery, $options: 'i' } },
                { email: { $regex: searchQuery, $options: 'i' } },
            ];

            if (mongoose.Types.ObjectId.isValid(searchQuery)) {
                query.$or.push({ _id: searchQuery });
            }
        }

        const totalUsers = await User.countDocuments(query);
        const totalPages = Math.ceil(totalUsers / limit);
        const users = await User.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        res.render('admin/layout', {
            body: 'customers',
            users: users || [],
            currentPage: page,
            totalPages,
            totalUsers,
            searchQuery,
            limit,
            admin: req.session.admin,
            messages: {} 
        });

      } catch (error) {
          console.error('Error in getUsers:', error.message);
          res.redirect('/admin/dashboard');
      }
  },

  blockUser: async (req, res) => {
      try {
          const userId = req.params.id;
          const user = await User.findByIdAndUpdate(
              userId,
              { isActive: false },
              { new: true }
          );

          if (user) {
              return res.json({ 
                  success: true, 
                  message:  message.USER_BLOCKED
              });
          } else {
              return res.json({ 
                  success: false, 
                  message: message.USER_NOT_FOUND 
              });
          }
      } catch (error) {
          console.error('Block user error:', error.message);
          return res.json({ 
              success: false, 
              message: message.BLOCK_FAILED
          });
      }
  },

  unblockUser: async (req, res) => {
      try {
          const userId = req.params.id;
          const user = await User.findByIdAndUpdate(
              userId,
              { isActive: true },
              { new: true }
          );

          if (user) {
              return res.json({ 
                  success: true, 
                  message:  message.USER_BLOCKED
              });
          } else {
              return res.json({ 
                  success: false, 
                  message: message.USER_NOT_FOUND
              });
          }
      } catch (error) {
          console.error('Unblock user error:', error.message);
          return res.json({ 
              success: false, 
              message: message.UNBLOCK_FAILED
          });
      }
  }
};

module.exports = adminController;
