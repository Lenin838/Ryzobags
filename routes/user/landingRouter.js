const express = require('express');
const landingRouter = express();
const landingController = require('../../controllers/users/landingPageController');



landingRouter.get('/',landingController.getLandingPage);
landingRouter.get('/productView/:id',landingController.loadProductView);
landingRouter.get('/shop', landingController.loadShopPage);



module.exports = landingRouter;