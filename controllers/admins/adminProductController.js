const Product = require('../../models/product');
const { resizeAndSaveImages } = require('../../middlewares/upload');
const Category = require('../../models/category'); 
const Brand = require('../../models/brand');
const statusCode = require('../../config/statusCode');
const message = require('../../config/messages')

const productController = {
  loadProductList: async (req, res) => {
    try {
      const perPage = 5;
      const page = parseInt(req.query.page) || 1;
      const search = req.query.search || '';
    
      const query = {};
      
      if (search) {
        query.name = { $regex: new RegExp(search, 'i') };
      }
      const total = await Product.countDocuments(query);
      let products = await Product.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * perPage)
        .limit(perPage);
      
    
      res.render('admin/layout', {
        body: 'productList',
        products,
        currentPage: page,
        totalPages: Math.ceil(total / perPage),
        search,
        totalCount: total
      });
    } catch (error) {
      console.error('Error loading product list', error.message);
      res.status(statusCode.INTERNAL_SERVER_ERROR).send(message.SERVER_ERROR + error.message);
    }
  },

  loadAddProductPage: async (req, res) => {
    try {
      const categories = await Category.find({ isActive: true });
      const brands = await Brand.find({ isActive: true });
      res.render('admin/layout', {
        body: 'productAdd',
        categories,
        brands,
        variant: [],
        validationErrors: {},
      });
    } catch (error) {
      console.error('Load add product error:', error.message);
      res.status(statusCode.INTERNAL_SERVER_ERROR).send(message.SERVER_ERROR);
    }
  },

  loadEditProductPage: async (req, res) => {
    try {
      const product = await Product.findById(req.params.id)
        .populate('category')
        .populate('brand');
      
      if (!product) {
        return res.status(statusCode.NOT_FOUND).send(message.PRODUCT_NOT_FOUND);
      }

      const categories = await Category.find({ isActive: true });
      const brands = await Brand.find({ isActive: true });

      res.render('admin/layout', {
        body: 'productEdit',
        product,
        categories,
        brands,
        validationErrors: {},
        discountPercentage: product.offer?.discountPercentage || 0,
      });
    } catch (error) {
      console.error('Load edit product error:', error.message);
      res.status(statusCode.INTERNAL_SERVER_ERROR).send(message.SERVER_ERROR);
    }
  },

  addProduct: async (req, res) => {
    try {

      if (!req.files?.mainImage || !req.files?.subImages) {
        return res.status(statusCode.BAD_REQUEST).json({
          success: false,
          message: 'Missing required image fields (mainImage or subImages)',
        });
      }
      const name = req.body.name?.trim();
      const productDup = await Product.findOne({ name: { $regex: name, $options: 'i' } });
      if (productDup) {
        return res.status(statusCode.BAD_REQUEST).json({
          success: false,
          message: message.DUPLICATE_NAME,
        });
      }

      const mainImage = req.files['mainImage'][0];
      const subImages = req.files['subImages'];

      if (!mainImage || subImages.length < 2) {
        return res.status(statusCode.BAD_REQUEST).json({
          success: false,
          message: 'Please upload 1 main image and at least 2 sub images',
        });
      }


      const processedMainImage = await resizeAndSaveImages([mainImage]);
      const processedSubImages = await resizeAndSaveImages(subImages);

      let variants = [];
        if (req.body.variants && typeof req.body.variants === 'object') {
          const categoryDoc = await Category.findById(req.body.category).lean();
          const productDiscount = Number(req.body.discountPercentage) || 0;
          const categoryDiscount = categoryDoc?.offer?.discountPercentage || 0;
          const maxDiscount = Math.max(productDiscount, categoryDiscount);

          const variantsObj = req.body.variants;
          const processedVariants = Object.values(variantsObj)
            .map((v) => {
              const regularPrice = Number(v.regularPrice);
              const discountedPrice = Math.round(regularPrice - (regularPrice * maxDiscount / 100));
              return {
                size: v.size,
                regularPrice,
                discountedPrice,
                quantity: Number(v.quantity),
              };
            })
            .filter((v) => v.size && !isNaN(v.regularPrice) && !isNaN(v.quantity));
        

      const sizeSet = new Set();
      const duplicateSizes = [];

      for(const variant of processedVariants){
        const sizeKey = variant.size.toLowerCase();
        if(sizeSet.has(sizeKey)){
          duplicateSizes.push(variant.size);
        }else{
          sizeSet.add(sizeKey);
        }
      }

      if(duplicateSizes.length > 0){
        return res.status(statusCode.BAD_REQUEST).json({
          success: false,
          message: message.DUPLICATE_SIZES`${duplicateSizes.join(', ')}. Each size must be unique.`
        });
      }
      variants = processedVariants;
    }
      const product = new Product({
        name: req.body.name?.trim(),
        description: req.body.description?.trim(),
        category: req.body.category,
        brand: req.body.brand,
        mainImage: processedMainImage[0],
        subImages: processedSubImages,
        variants,
        offer: {
          discountPercentage: Number(req.body.discountPercentage) || 0,
        },
      });

      await product.save();

      return res.status(statusCode.OK).json({
        success: true,
        message: message.PRODUCT_ADDED_SUCCESSFULLY,
        productId: product._id,
      });
    } catch (error) {
      console.error('Add product error:', error);
      return res.status(statusCode.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: `Server error: ${error.message}`,
      });
    }
  },

  editProduct: async (req, res) => {
    try {
      const product = await Product.findById(req.params.id);
      if (!product) {
        return res.status(statusCode.NOT_FOUND).json({
          success: false,
          message: message.PRODUCT_NOT_FOUND
        });
      }

      const { name, description, category, brand, discountPercentage } = req.body;

      if (!name?.trim()) {
        return res.status(statusCode.BAD_REQUEST).json({
          success: false,
          message: message.INVALID_NAME
        });
      }
      if (!description?.trim()) {
        return res.status(statusCode.BAD_REQUEST).json({
          success: false,
          message: message.INVALID_DESCRIPTION
        });
      }
      if (!category) {
        return res.status(statusCode.BAD_REQUEST).json({
          success: false,
          message: message.CATEGORY_REQUIRED
        });
      }
      if (!brand) {
        return res.status(statusCode.BAD_REQUEST).json({
          success: false,
          message: message.BRAND_REQUIRED
        });
      }

      const parsedDiscount = parseFloat(discountPercentage);
      if (discountPercentage !== undefined && (isNaN(parsedDiscount) || parsedDiscount < 0 || parsedDiscount > 100)) {
        return res.status(statusCode.BAD_REQUEST).json({
          success: false,
          message: message.INVALID_DISCOUNT
        });
      }

      const productDup = await Product.findOne({
        name: { $regex: new RegExp(`^${name.trim()}$`, 'i') },
        _id: { $ne: req.params.id }
      });
      if (productDup) {
        return res.status(statusCode.BAD_REQUEST).json({
          success: false,
          message: message.DUPLICATE_NAME
        });
      }

      let mainImage = product.mainImage;
      let subImages = [...product.subImages];

      if (req.body.deleteMainImage === 'true') {
        if (!req.files?.mainImage) {
          return res.status(statusCode.BAD_REQUEST).json({
            success: false,
            message: message.MAIN_IMAGE_REQUIRED
          });
        }
      }

      if (req.files?.mainImage) {
        try {
          const processedMainImage = await resizeAndSaveImages([req.files['mainImage'][0]]);
          
          if (!Array.isArray(processedMainImage) || !processedMainImage[0]) {
            throw new Error('Main image processing failed: Empty result');
          }
          
          if (typeof processedMainImage[0] === 'object' && processedMainImage[0].filename) {
            mainImage = processedMainImage[0].filename;
          } else {
            mainImage = processedMainImage[0];
          }
        } catch (error) {
          console.error('Main image processing error:', error);
          return res.status(statusCode.BAD_REQUEST).json({
            success: false,
            message: `Failed to process main image: ${error.message}`
          });
        }
      }

      if (!mainImage) {
        return res.status(statusCode.BAD_REQUEST).json({
          success: false,
          message: message.MAIN_IMAGE_REQUIRED
        });
      }

      if (req.files?.subImages) {
        try {
          const processedSubImages = await resizeAndSaveImages(req.files['subImages']);
          
          if (!Array.isArray(processedSubImages)) {
            throw new Error('Sub-image processing failed: Invalid output format');
          }
          
          const newSubImages = processedSubImages.map(img => {
            if (typeof img === 'object' && img.filename) {
              return img.filename;
            }
            return img;
          });
          
          subImages = [...subImages, ...newSubImages];
        } catch (error) {
          console.error('Sub-images processing error:', error);
          return res.status(statusCode.BAD_REQUEST).json({
            success: false,
            message: `Failed to process sub-images: ${error.message}`
          });
        }
      }

      if (req.body.deletedSubImages) {
        const deletedIndices = Array.isArray(req.body.deletedSubImages)
          ? req.body.deletedSubImages.map(Number)
          : [Number(req.body.deletedSubImages)];
        subImages = subImages.filter((_, index) => !deletedIndices.includes(index));
      }

      if (subImages.length < 3) {
        return res.status(statusCode.BAD_REQUEST).json({
          success: false,
          message: 'At least 3 sub-images are required'
        });
      }

      let variants = [];
      if (req.body.variants && typeof req.body.variants === 'object') {
        const categoryDoc = await Category.findById(category).lean();
        const productDiscount = Number(discountPercentage) || 0;
        const categoryDiscount = categoryDoc?.offer?.discountPercentage || 0;
        const maxDiscount = Math.max(productDiscount, categoryDiscount);

        const processedVariants = Object.values(req.body.variants)
          .filter(v => v.size?.trim() && !isNaN(v.regularPrice) && !isNaN(v.quantity))
          .map(v => {
            const regularPrice = Number(v.regularPrice);
            const discountedPrice = Math.round(regularPrice - (regularPrice * maxDiscount / 100));
            return {
              size: v.size.trim(),
              regularPrice,
              discountedPrice,
              quantity: Number(v.quantity),
            };
          });

        const sizeSet = new Set();
        const duplicateSizes = [];

        for(const variant of processedVariants){
          const sizeKey = variant.size.toLowerCase();
          if(sizeSet.has(sizeKey)){
            duplicateSizes.push(variant.size);
          }else{
            sizeSet.add(sizeKey);
          }
        }

        if(duplicateSizes.length > 0){
          return res.status(statusCode.BAD_REQUEST).json({
            success: false,
            message: message.DUPLICATE_NAME`${duplicateSizes.join(', ')}. Each size must be unique.`,
          });
        }
        variants = processedVariants;
      }

      if (variants.length === 0) {
        return res.status(statusCode.BAD_REQUEST).json({
          success: false,
          message: message.VARIANT_REQUIRED
        });
      }

      product.name = name.trim();
      product.description = description.trim();
      product.category = category;
      product.brand = brand;
      product.mainImage = mainImage;
      product.subImages = subImages;
      product.variants = variants;
      product.offer = {
        discountPercentage: parsedDiscount || 0, 
      };

      await product.save();

      return res.status(statusCode.OK).json({
        success: true,
        message: message.PRODUCT_EDITED,
        productId: product._id
      });
    } catch (error) {
      console.error('Edit product error:', error);
      return res.status(statusCode.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: message.SERVER_ERROR`: ${error.message}`
      });
    }
  },

  toggleProductListing: async (req, res) => {
    try {
      const product = await Product.findById(req.params.id);
      product.isListed = !product.isListed;
      await product.save();
      return res.status(statusCode.OK).json({success: true});
    } catch (error) {
      console.error('Toggle product listing error:', error.message);
      res.status(statusCode.INTERNAL_SERVER_ERROR).json({success: false,message: message.INTERNAL_SERVER_ERROR});
    }
  },
};
module.exports = productController;
