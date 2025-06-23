const isAuthenticated = (req, res, next) => {
    if (req.session.user) {
        req.user = req.session.user; // ✅ Attach session user to request
        next();
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
