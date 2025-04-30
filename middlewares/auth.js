
const isAuthenticated = (req, res, next) => {
    if (req.session.user){
        next();
    } else {
        res.redirect('/auth/login');
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