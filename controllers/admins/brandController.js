const Brand = require('../../models/brand');
const statusCode = require('../../config/statusCode');
const message = require('../../config/messages');

const brandController = {
    getBrandList: async (req,res) => {
        try {
            const searchQuery = req.query.search || '';
            const page = parseInt(req.query.page) || 1;
            const limit = 3;
            const skip = (page -1)*limit;

            const regex = new RegExp(searchQuery, 'i');
            const query = searchQuery?{name:regex}:{};

            const brands = await Brand.find(query)
                .sort({createdAt:-1})
                .skip(skip)
                .limit(limit);

            const totalBrands = await Brand.countDocuments(query);
            const totalPages = Math.ceil(totalBrands/limit);

            res.render('admin/layout',{
                body:'brandList',
                brands,
                totalBrands,
                currentPage: page,
                totalPages,
                limit,
                searchQuery
            });
        } catch (error) {
            console.error('Error loading brands:',error);
            res.status(statusCode.INTERNAL_SERVER_ERROR).send(message.INTERNAL_SERVER_ERROR);
        }
    },

    getAddBrand: async (req,res) => {
        res.render('admin/layout',{
            body:'addBrand'
        });
    },

    postAddBrand: async (req, res) => {
        try {
          const name = req.body.name.trim();
          const description = req.body.description;
      
          const existingBrand = await Brand.findOne({
            name: { $regex: `^${name}$`, $options: 'i' }
          });
      
          if (existingBrand) {
            req.flash('error', message.BRAND_DUPLICATE);
            return res.redirect('/admin/brands/add'); 
          }
      
          const brand = new Brand({ name, description });
          await brand.save();
      
          req.flash('success', message.BRAND_ADDED);
          res.redirect('/admin/brands');
        } catch (error) {
          console.error('Error adding brand:', error);
          req.flash('error',message.INTERNAL_SERVER_ERROR);
          res.redirect('/admin/brands/add');
        }
    },
      
    getEditBrand: async (req,res) => {
        try {
            const brand = await Brand.findById(req.params.id);
            res.render('admin/layout',{
                body:'editBrand',
                brand
            });
        } catch (error) {
            console.error('Error loading edit brand:',error);
            res.status(statusCode.INTERNAL_SERVER_ERROR).send(message.INTERNAL_SERVER_ERROR);
        }
    },

    postEditBrand: async (req, res) => {
        try {
          const { name, description } = req.body;
          const brandId = req.params.id;
          const trimmedName = name.trim();
      
          const duplicate = await Brand.findOne({
            _id: { $ne: brandId }, 
            name: { $regex: `^${trimmedName}$`, $options: 'i' }
          });
      
          if (duplicate) {
            return res.status(statusCode.BAD_REQUEST).json({success: false, message:message.BRAND_NAME_ALREADY_EXISTS});
          }
      
          await Brand.findByIdAndUpdate(brandId, {
            name: trimmedName,
            description,
          });
      
         return res.status(statusCode.OK).json({success:true,message:message.BRAND_UPDATED});
        } catch (error) {
          console.error('Error updating brand:', error);
          return res.status(statusCode.INTERNAL_SERVER_ERROR).json({success: false, message: message.INTERNAL_SERVER_ERROR});
        }
    },
      
    unlistedBrand: async (req,res) => {
        try {
            await Brand.findByIdAndUpdate(req.params.id,{isActive:false});
            return res.status(statusCode.OK).json({success: true});
        } catch (error) {
            console.error('Error unlisting brand:',error);
            res.status(statusCode.INTERNAL_SERVER_ERROR).json({success: false,message:message.INTERNAL_SERVER_ERROR});
        }
    },

    listBrand: async (req,res) => {
        try {
            await Brand.findByIdAndUpdate(req.params.id,{isActive:true});
            return res.status(statusCode.OK).json({success: true})
        } catch (error) {
            console.error('Error listing brand:',error);
            res.status(statusCode.INTERNAL_SERVER_ERROR).json({success:false,message:message.INTERNAL_SERVER_ERROR});
        }
    }
};

module.exports=brandController;