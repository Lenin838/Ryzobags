const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const Admin = require('../../models/Admin');
const User = require('../../models/User');


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
        errors.email = 'Email is required.';
      } else if (!/^[^\s@]+@[^\s@]+$/.test(email)) {
        errors.email = 'Invalid email format.';
      }

      if (!password || password.trim() === '') {
        errors.password = 'Password is required.';
      }

      if (Object.keys(errors).length > 0) {
        return res.status(400).json({ success: false, errors });
      }

      const admin = await Admin.findOne({ email });
      if (!admin) {
        return res.status(400).json({ success: false, message: 'Admin not found.' });
      }

      const isMatch = await bcrypt.compare(password, admin.password);
      if (!isMatch) {
        return res.status(400).json({ success: false, message: 'Invalid credentials.' });
      }

      req.session.admin = admin;
      return res.status(200).json({ success: true, message: 'Login successful!' });

    } catch (error) {
      console.error('Admin login error:', error.message);
      res.status(500).json({ success: false, message: 'Server error. Please try again later.' });
    }
  },

  adminLogout: async (req, res) => {
    try {
      req.session.destroy(() => {
        res.redirect('/admin/login');
      });
    } catch (error) {
      console.error('Admin logout error:', error.message);
      res.status(500).json({ message: 'Server error' });
    }
  },

  loadHome: async (req, res) => {
    try {
      if (!req.session.admin) return res.redirect('/admin/login');

      res.render('admin/layout', {
        body: 'dashboard',
        admin: req.session.admin,
      });
    } catch (error) {
      console.error('Dashboard load error:', error.message);
      res.status(500).render('error', { message: 'Failed to load dashboard' });
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

        return res.redirect('/admin/users-management');
    } catch (error) {
        console.error('Block user error:', error.message);
        res.redirect('/admin/users-management');
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

        return res.redirect('/admin/users-management');
    } catch (error) {
        console.error('Unblock user error:', error.message);
        res.redirect('/admin/users-management');
    }
}
};

module.exports = adminController;
