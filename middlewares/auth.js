const user=require("../models/User")


const isAuthenticated = async(req, res, next) => {
    
    if (req.session.user) {
        const userId = req.session.user._id;
        console.log("isauthenticates",userId)
        const userdetails= await user.findById(userId)
        console.log("isauthenticates",userdetails)
        if(userdetails.isActive===false){
            res.redirect("/user/login")
        }
        req.user = userdetails;
        next()
    } else {
        res.redirect('/user/login');
    }
};

const isNotAuthenticated = (req, res, next) => {
    if (!req.session.user) {
        next();
    } else {
        res.redirect('/user/home');
    }
};

module.exports = {
    isAuthenticated,
    isNotAuthenticated,
};
