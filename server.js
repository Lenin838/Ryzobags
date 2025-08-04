const express = require('express');
const app =  express();
require('dotenv').config();
const path = require('path');
const connectDB=require("./config/db");
const userRouter = require('./routes/user/authRoutes');
const adminRouter = require('./routes/admin/adminAuthRoutes');
const session = require('express-session');
const passport = require("passport");
const flash = require('connect-flash');


app.use(express.json());
app.use(express.urlencoded({extended:true}));  


app.use(session({
    secret: process.env.SESSION_SECRET || "fallback-secret", 
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false,
        maxAge: 5*60*60*1000
     }  
}));

app.use((req, res, next) => {
    res.header('Cache-Control', 'no-cache, private, no-store, must-revalidate, max-stale=0, post-check=0, pre-check=0');
    res.header('Expires', '-1');
    res.header('Pragma', 'no-cache');
    next();
});


app.use(flash());

app.use((req, res, next) => {
    res.locals.success = req.flash('success');
    res.locals.error = req.flash('error');
    next();
  });


connectDB();
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
console.log("Looking for views in:", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));


app.use(passport.initialize());
app.use(passport.session());

app.use((req, res, next) => {
    console.log(`Requested: ${req.method} ${req.originalUrl}`); 
    next();
  });
app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    next();
});



app.get('/',(req,res)=>{
    res.render('user/landing');
});



app.use("/auth",userRouter);
app.use('/user',userRouter);
app.use('/admin',adminRouter);


app.use((req,res,next)=>{
    res.render('404');
    next();
});

// app.use((err,req,res,next)=>{
//     console.error("Global Error Handler:",err.stack);

//     if(res.headersSent){
//         return next(err);
//     }

//     if(req.originalUrl.startsWith('/api')){
//         return res.status(err.status || 500).json({
//             success:false,
//             message: err.message || "Internal server error",
//         });
//     }

//     res.status(err.status || 500).json({
//         success: false,
//         message:err.message,
//         error: process.env.NODE_ENV === 'development'?err:{}
//     });
// });


const PORT = process.env.PORT;
app.listen(PORT,()=>{
    console.log(`RYZO BAGS is running on http://127.0.0.1:${PORT}`);
})