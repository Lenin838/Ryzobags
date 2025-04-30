const Product = require('../../models/product');
const { resizeAndSaveImages } = require('../../middlewares/upload');
const Category = require('../../models/category'); 
const Brand = require('../../models/brand');

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
      
      console.log(`Found ${products.length} products out of ${total} total`);
    
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
      res.status(500).send('Server error: ' + error.message);
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
      res.status(500).send('Server Error');
    }
  },

  loadEditProductPage: async (req, res) => {
    try {
      const product = await Product.findById(req.params.id)
        .populate('category')
        .populate('brand');
      
      if (!product) {
        return res.status(404).send('Product not found');
      }
  

      const categories = await Category.find({ isActive: true });
      const brands = await Brand.find({ isActive: true });
  
      res.render('admin/layout', {
        body: 'productEdit',
        product,
        categories,
        brands,
        validationErrors: {},
      });
    } catch (error) {
      console.error('Load edit product error:', error.message);
      res.status(500).send('Server Error');
    }
  },
  addProduct: async (req, res) => {
    try {
        console.log('Add product request received');

        if (!req.files?.mainImage || !req.files?.subImages) {
            return res.status(400).json({
                success: false,
                message: 'Missing required image fields (mainImage or subImages)'
            });
        }
        const name=req.body.name?.trim();
        const productDup=await Product.findOne({name:{$regex:name,$options:'i'}})
        if(productDup){
          return res.status(400).json({
            success: false,
            message: 'Product with same name already available'
        });
        }

        const mainImage = req.files['mainImage'][0];
        const subImages = req.files['subImages'];

        if (!mainImage || subImages.length < 2) {
            return res.status(400).json({
                success: false,
                message: 'Please upload 1 main image and at least 2 sub images'
            });
        }

        console.log(`Processing images: mainImage=${mainImage.originalname}, subImages=${subImages.length}`);

        const processedMainImage = await resizeAndSaveImages([mainImage]);
        const processedSubImages = await resizeAndSaveImages(subImages);

        let variants = [];
        if (req.body.variants && typeof req.body.variants === 'object') {
            const variantsObj = req.body.variants;
            variants = Object.values(variantsObj).map(v => ({
                size: v.size,
                regularPrice: Number(v.regularPrice),
                quantity: Number(v.quantity),
            })).filter(v => v.size && !isNaN(v.regularPrice) && !isNaN(v.quantity));
        }

        const product = new Product({
            name: req.body.name?.trim(),
            description: req.body.description?.trim(),
            category: req.body.category,
            brand: req.body.brand,
            mainImage: processedMainImage[0],
            subImages: processedSubImages,
            variants
        });

        await product.save();

        return res.status(200).json({
            success: true,
            message: 'Product added successfully',
            productId: product._id
        });
    } catch (error) {
        console.error('Add product error:', error);
        return res.status(500).json({
            success: false,
            message: `Server error: ${error.message}`
        });
    }
},
editProduct: async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    const { name, description, category, brand } = req.body;
    if (!name?.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Product name is required'
      });
    }
    if (!description?.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Description is required'
      });
    }
    if (!category) {
      return res.status(400).json({
        success: false,
        message: 'Category is required'
      });
    }
    if (!brand) {
      return res.status(400).json({
        success: false,
        message: 'Brand is required'
      });
    }

    const productDup = await Product.findOne({
      name: { $regex: new RegExp(`^${name.trim()}$`, 'i') },
      _id: { $ne: req.params.id }
    });
    if (productDup) {
      return res.status(400).json({
        success: false,
        message: 'Product with same name already exists'
      });
    }

    let mainImage = product.mainImage;
    let subImages = [...product.subImages];

    if (req.body.deleteMainImage === 'true') {
      if (!req.files?.mainImage) {
        return res.status(400).json({
          success: false,
          message: 'Main image is required and cannot be deleted without uploading a new one'
        });
      }
    }

    if (req.files?.mainImage) {
      try {
        console.log('Main image file:', req.files['mainImage'][0]);
        const processedMainImage = await resizeAndSaveImages([req.files['mainImage'][0]]);
        console.log('Processed main image:', processedMainImage);
        
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
        return res.status(400).json({
          success: false,
          message: `Failed to process main image: ${error.message}`
        });
      }
    }

    if (!mainImage) {
      return res.status(400).json({
        success: false,
        message: 'Main image is required'
      });
    }
    console.log('Final mainImage:', mainImage);

    if (req.files?.subImages) {
      try {
        console.log('Sub image files:', req.files['subImages']);
        const processedSubImages = await resizeAndSaveImages(req.files['subImages']);
        console.log('Processed sub images:', processedSubImages);
        
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
        return res.status(400).json({
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
      return res.status(400).json({
        success: false,
        message: 'At least 3 sub-images are required'
      });
    }

    let variants = [];
    if (req.body.variants && typeof req.body.variants === 'object') {
      variants = Object.values(req.body.variants)
        .filter(v => v.size?.trim() && !isNaN(v.regularPrice) && !isNaN(v.quantity))
        .map(v => ({
          size: v.size.trim(),
          regularPrice: Number(v.regularPrice),
          quantity: Number(v.quantity),
        }));
    }
    if (variants.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one variant is required'
      });
    }

    product.name = name.trim();
    product.description = description.trim();
    product.category = category;
    product.brand = brand;
    product.mainImage = mainImage;
    product.subImages = subImages;
    product.variants = variants;

    await product.save();

    return res.status(200).json({
      success: true,
      message: 'Product updated successfully',
      productId: product._id
    });
  } catch (error) {
    console.error('Edit product error:', error);
    return res.status(500).json({
      success: false,
      message: `Server error: ${error.message}`
    });
  }
},


  toggleProductListing: async (req, res) => {
    try {
      const product = await Product.findById(req.params.id);
      product.isListed = !product.isListed;
      await product.save();
      res.redirect('/admin/products');
    } catch (error) {
      console.error('Toggle product listing error:', error.message);
      res.status(500).send('Server error');
    }
  },
};
module.exports = productController;
