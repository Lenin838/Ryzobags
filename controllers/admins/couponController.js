const Coupon = require("../../models/coupon");

const couponController = {
    listCoupons: async (req,res) => {
        try{
            const coupons = await Coupon.find().sort({createdAt:-1});
            res.render('admin/layout',{
                body: "listCoupon",
                coupons,});
        }catch (err){
            res.status(500).send("Failed to load coupons");
        }
    },

    createCoupon: async (req,res) => {
        try{
            const {code,discountAmount,minCartAmount,maxDiscount,expiresAt,usageLimit} = req.body;

            const existing = await Coupon.findOne({code: code.toUpperCase()});
            if(existing){
                return res.status(400).json({error: "coupon code already exists"});
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
            res.status(201).json({message: "coupon created successfully"});
        }catch(err){
            res.status(500).json({error: "Failed to create coupon"});
        }
    },

    updateCoupon: async (req,res) => {
        try{
            const {id} = req.params;
            const {code,discountAmount,minCartAmount,maxDiscount,expiresAt,usageLimit,isActive} = req.body;

            const existingCoupon = await Coupon.findOne({code: code.toUpperCase(),_id:{$ne:id}});
            if(existingCoupon){
                return res.status(400).json({error: "coupon code already in use by another coupon."});
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

            res.json({message: "coupon updated successfully"});
        }catch (err){
            res.status(500).json({error: "Failed to update coupon"});
        }
    },
    
    deleteCoupon: async (req,res) => {
        try{
            const {id} = req.params;
            await Coupon.findByIdAndUpdate(id,{isActive: false});
            res.json({message: "Coupon deleted sucessfully"});
        }catch(err){
            res.status(500).json({error: "Failed to delete coupon"});
        }
    }
}

module.exports = couponController;