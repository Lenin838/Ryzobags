const Category = require('../../models/category');

const categoryController = {
    getCategoryList: async (req, res) => {
        try {
            const searchQuery = req.query.search || '';
            const page = parseInt(req.query.page) || 1;
            const limit = 2;
            const skip = (page - 1) * limit;

            const searchRegex = new RegExp(searchQuery, 'i');
            const query = searchQuery ? { name: searchRegex } : {};

            const categories = await Category
                .find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit);

            const totalCategories = await Category.countDocuments(query);
            const totalPages = Math.ceil(totalCategories / limit);

            res.render('admin/layout', {
                body: 'category',
                categories,
                totalCategories,
                currentPage: page,
                totalPages,
                limit,
                searchQuery
            });
        } catch (error) {
            console.error("Error loading Categories:", error);
            res.status(500).send('Internal server error');
        }
    },

    getAddCategory: async (req, res) => {
        res.render('admin/layout', {
            body: 'addCategory'
        });
    },

    postAddCategory: async (req, res) => {
        try {
            const name = req.body.name.trim();
            const description = req.body.description.trim();
            const discountPercentage = parseInt(req.body.discountPercentage) || 0;

            const existingCategory = await Category.findOne({
                name: { $regex: `^${name}$`, $options: 'i' }
            });

            if (existingCategory) {
                req.flash('error', 'Category with the same name already exists');
                return res.redirect('/admin/categories/add');
            }

            const category = new Category({
                name,
                description,
                isActive: true,
                offer: { discountPercentage }
            });
            await category.save();

            req.flash('success', 'Category added successfully');
            res.redirect('/admin/categories');
        } catch (error) {
            console.error('Error adding category:', error);
            req.flash('error', 'Internal server error');
            res.redirect('/admin/categories/add');
        }
    },

    getEditCategory: async (req, res) => {
        try {
            const category = await Category.findById(req.params.id);
            res.render('admin/layout', {
                body: 'editCategory',
                category
            });
        } catch (error) {
            console.error('Error loading edit page:', error);
            res.status(500).send('Internal server error');
        }
    },

    postEditCategory: async (req, res) => {
        try {
            const { name, description, discountPercentage } = req.body;
            const categoryId = req.params.id;
            const trimmedName = name.trim();
            const trimmedDescription = description.trim();
            const parsedDiscount = parseInt(discountPercentage) || 0;

            const duplicate = await Category.findOne({
                _id: { $ne: categoryId },
                name: { $regex: `^${trimmedName}$`, $options: 'i' }
            });

            if (duplicate) {
                return res.status(400).json({success: false,message: "Another category with the same name already exists"});
            }

            await Category.findByIdAndUpdate(categoryId, {
                name: trimmedName,
                description: trimmedDescription,
                offer: { discountPercentage: parsedDiscount }
            });

            return res.status(200).json({success:true,message:"Category edited successfully"});
        } catch (error) {
            console.error('Error updating category:', error);
            return res.status(500).json({success: false,message: "Internal server error"});
        }
    },

    unlistCategory: async (req, res) => {
        try {
            await Category.findByIdAndUpdate(req.params.id, { isActive: false });
            return res.status(200).json({success: true})
        } catch (error) {
            console.error('Error unlisting category:', error);
            res.status(500).json({success:false,message:"Internal server error"});
        }
    },

    listCategory: async (req, res) => {
        try {
            await Category.findByIdAndUpdate(req.params.id, { isActive: true });
            return res.status(200).json({success: true});
        } catch (error) {
            console.error('Error listing category:', error);
            res.status(500).json({success:false,message:"Internal server error"});
        }
    }
};

module.exports = categoryController;
