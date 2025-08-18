const Coupon = require("../../models/coupon");
const statusCode = require('../../config/statusCode');
const message = require('../../config/messages');

const couponController = {
    listCoupons: async (req,res) => {
        try{
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 5;
            const skip = (page - 1) * limit;

            const coupons = await Coupon.find().sort({createdAt:-1}).skip(skip).limit(limit);
            const totalCoupons = await Coupon.countDocuments();
            res.render('admin/layout',{
                body: "listCoupon",
                totalCoupons,
                page,
                limit,
                totalPages: Math.ceil(totalCoupons / limit),
                coupons,});
        }catch (err){
            console.error("Error in listCoupons:",err);
            res.status(statusCode.INTERNAL_SERVER_ERROR).send("Failed to load coupons");
        }
    },

    createCoupon: async (req,res) => {
        try{
            const {code,discountAmount,minCartAmount,maxDiscount,expiresAt,usageLimit} = req.body;

            const existing = await Coupon.findOne({code: code.toUpperCase()});
            if(existing){
                return res.status(statusCode.BAD_REQUEST).json({error: message.COUPON_EXISTS});
            }

            const newCoupon = new Coupon({
                code,
                discountAmount,
                minCartAmount,
                maxDiscount,
                expiresAt,
                usageLimit
            });

            await newCoupon.save();
            res.status(statusCode.CREATED).json({message: message.COUPON_CREATED});
        }catch(err){
            res.status(statusCode.INTERNAL_SERVER_ERROR).json({error: message.COUPON_CREATE_FAILED});
        }
    },

    updateCoupon: async (req,res) => {
        try{
            const {id} = req.params;
            const {code,discountAmount,minCartAmount,maxDiscount,expiresAt,usageLimit,isActive} = req.body;

            const existingCoupon = await Coupon.findOne({code: code.toUpperCase(),_id:{$ne:id}});
            if(existingCoupon){
                return res.status(statusCode.BAD_REQUEST).json({error: message.COUPON_CODE_IN_USE});
            }

            await Coupon.findByIdAndUpdate(id,{
                code,
                discountAmount,
                minCartAmount,
                maxDiscount,
                expiresAt,
                usageLimit,
                isActive
            });

            res.json({message: message.COUPON_UPDATED});
        }catch (err){
            res.status(statusCode.INTERNAL_SERVER_ERROR).json({error: message.COUPON_UPDATE_FAILED});
        }
    },
    
    deleteCoupon: async (req,res) => {
        try{
            const {id} = req.params;
            await Coupon.findByIdAndUpdate(id,{isActive: false});
            res.json({message: message.COUPON_DELETED});
        }catch(err){
            res.status(statusCode.INTERNAL_SERVER_ERROR)
            json({error: message.COUPON_DELETE_FAILED});
        }
    }
}

module.exports = couponController;