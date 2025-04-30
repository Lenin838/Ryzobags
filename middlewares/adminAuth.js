
const isAdminLoggedIn = (req, res, next) => {
    if (req.session.admin) {
      next();
    } else {
      req.flash('error', 'Please login to access the admin panel');
      res.redirect('/admin/login');
    }
  };
  
  const isAdminLoggedOut = (req, res, next) => {
    if (req.session.admin) {
      res.redirect('/admin/dashboard');
    } else {
      next();
    }
  };
  
  module.exports = {
    isAdminLoggedIn,
    isAdminLoggedOut
  };