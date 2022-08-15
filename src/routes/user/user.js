/* eslint-disable max-len */
const {Router} = require('express');
const router = new Router({mergeParams: true});
const User = require('../../models/User');
const path = require('path');
require('dotenv').config({
  silent: true, path: path.join(__dirname, '../..', '.env'),
}); // Stores custom environmental variables
const bcrypt = require('bcrypt');
const {body, validationResult} = require('express-validator');
const axios = require('axios');

// Avatar upload
const aws = require('aws-sdk');
const s3 = new aws.S3();
s3.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY,
  secretAccessKey: process.env.AWS_SECRET_KEY,
  region: process.env.AWS_REGION,
});
const multer = require('multer');
const multerS3 = require('multer-s3');
const s3Storage = multerS3({
  s3: s3,
  acl: 'public-read',
  bucket: process.env.AWS_S3_BUCKET,
  key: async function(req, file, cb) {
    try {
      const user = await User.findOne({user_id: req.body.userId});
      const newFilename = `${file.fieldname}${path.extname(file.originalname)}`;
      user.avatar = newFilename;
      user.save();
      cb(null, `u/${req.body.userId}/${newFilename}`);
      req.body.success = true;
    } catch (err) {
      console.log('Error during user avatar upload');
      console.log(err);
    }
  },
});
const imageFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image')) {
    cb(null, true);
  } else {
    req.body.code = 400;
    req.body.success = false;
    req.body.error = 'Invalid filetype (not an image)';
    cb(null, false);
  }
};
const upload = multer({storage: s3Storage, fileFilter: imageFilter});
const CMC_HEADER = {'X-CMC_PRO_API_KEY': process.env.CMC_API_KEY};

// Routes
router.get("/balance", async(req, res) => {
  const userId = req.user.user_id;
  try{
    const user = await User.findOne({user_id: userId});
    const balance = user.balance;
    res.json({success: true, balance: balance});
  }catch (err){
    console.log('Error getting user balance');
    console.log(err);
    res.status(500).json({success: false, error: 'Server error'});
  }
})
router.get("/history",async (req, res) => {
  const userId = req.user.user_id;
  try{
    const user = await User.findOne({user_id: userId});
    const historys = user.historys;
    res.json({success: true, historys: historys});
  }catch (err){
    console.log('Error getting user history');
    console.log(err);
    res.status(500).json({success: false, error: 'Server error'});
  }
})
router.get('/assets', async (req, res) => {
  const userId = req.user.user_id;
  try {
    const user = await User.findOne({user_id: userId});
    // console.log("user:", user);
    const assets = user.assets;
    const assetsPrice = user.assetsPrice;
    res.json({success: true, assets: assets, assetsPrice: assetsPrice});
  } catch (err) {
    console.log('Error getting user assets');
    console.log(err);
    res.status(500).json({success: false, error: 'Server error'});
  }
});

router.get('/assets/:symbol', async (req, res) => {
  const SYMBOL = req.params.symbol.toUpperCase();
  const userId = req.user.user_id;
  try {
    const user = await User.findOne({user_id: userId});
    if (user.assets[SYMBOL]) {
      res.json({success: true, amount: user.assets[SYMBOL]});
    } else {
      res.json({success: true, amount: 0});
    }
  } catch (err) {
    console.log('Error getting an asset from user assets');
    console.log(err);
    res.status(500).json({success: false, error: 'Server error'});
  }
});

router.post('/update/assets/:symbol', async (req, res) => {
  const SYMBOL = req.params.symbol.toUpperCase();
  const userId = req.user.user_id;
  const cryptoAmount = req.body.amount; // if quantity is negative then, it is a drop command
  
  const apiResponse = await axios.get(`${process.env.CMC_API_URL_V2}/quotes/latest?symbol=${SYMBOL}`, {headers: CMC_HEADER});
  const data = apiResponse.data.data[SYMBOL][0];
  const price = data.quote.USD.price.toString();
  const cryptoPrice = cryptoAmount* data.quote.USD.price
  try {
    const user = await User.findOne({user_id: userId});
    // add to the assets property of the user here
    if ( user.balance < cryptoPrice){
      res.json({ success: false, error: "You don't have enough balance."})
    }
    const assets = user.assets;
    const assetsPrice = user.assetsPrice;
    const historys = user.historys;
    user.balance -= cryptoPrice;
    if (cryptoAmount>0){
      const history = {
        symbol: SYMBOL,
        amount: cryptoAmount,
        price: price,
        action: "BUY",
        date: new Date()
      }
      historys.push(history)
    }
    else{
      const history = {
        symbol: SYMBOL,
        amount: -cryptoAmount,
        price: price,
        action: "SELL",
        date: new Date()
      }
      historys.push(history)
    }
    if (SYMBOL in assets) {
      assets[SYMBOL] += cryptoAmount;
      assetsPrice[SYMBOL] += cryptoPrice;
      console.log(`Added ${cryptoAmount} ${SYMBOL} to user assets with ${cryptoPrice}$.`);
    } else {
      assets[SYMBOL] = cryptoAmount;
      assetsPrice[SYMBOL] = cryptoPrice;
      console.log(`No ${SYMBOL} in user assets. Added ${SYMBOL} with amount ${cryptoAmount} to user assets with ${cryptoPrice}$.`);
    }
    if (assets[SYMBOL] === 0) { // Remove crypto from assets field
      delete assets[SYMBOL];
      delete assetsPrice[SYMBOL];
      console.log(`Deleted ${SYMBOL} with amount 0 from user assets`);
    }
    user.markModified('assets');
    user.markModified('assetsPrice')
    user.save();
    console.log("after: ", user);
    res.json({success: true});
  } catch (err) {
    console.log('Error updating user assets');
    console.log(err);
    res.status(500).json({success: false, error: 'Server error'});
  }
});

router.get('/avatar', async (req, res) => {
  const user = req.user;
  const userId = user.user_id;
  res.json({success: true, url: `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/u/${userId}/${user.avatar}`});
});

router.post('/update/avatar', upload.single('avatar'), (req, res) => {
  if (req.body.success) {
    res.json({success: true});
  } else {
    res.status(req.body.code).json({success: false, error: req.body.error});
  }
});

router.get('/progress/:lessonId', async (req, res) => {
  const userId = req.user.user_id;
  const lessonId = req.params.lessonId;
  try {
    const user = await User.findOne({user_id: userId});
    const progress = user.lessonProgress[lessonId] || {};
    res.json({success: true, progress: progress});
  } catch (err) {
    console.log('Error getting user lesson progress');
    console.log(err);
    res.status(500).json({success: false, error: 'Server error'});
  }
});

router.post('/update/progress/:lessonId', async (req, res) => {
  const userId = req.user.user_id;
  const lessonId = req.params.lessonId;
  const questionNumber = parseInt(req.body.questionNumber);
  console.log(req.body);
  try {
    const user = await User.findOne({user_id: userId});
    const progress = user.lessonProgress;
    user.balance += 2000;
    if (!progress[lessonId]) {
      progress[lessonId] = {};
    }
    const currentLessonProgress = progress[lessonId];
    currentLessonProgress[questionNumber] = true;
    user.markModified('lessonProgress');
    user.save();
    res.json({success: true});
  } catch (err) {
    console.log('Error updating user lesson progress');
    console.log(err);
    res.status(500).json({success: false, error: 'Server error'});
  }
});

router.get('/info', (req, res) => {
  const user = req.user;
  res.json(user);
});

router.post('/update/info',
    body('email').isEmail(),
    body('username').isLength({min: 6}),
    async (req, res) => {
      const validationErrors = validationResult(req);
      if (validationErrors.isEmpty()) {
        try {
          const userId = req.user.user_id;
          const user = await User.findOne({user_id: userId});
          const changedUsername = (user.username !== req.body.username);
          let duplicateUsername = false;
          if (changedUsername) {
            const duplicateUsers = await User.find({username: req.body.username});
            if (duplicateUsers.length > 0) {
              duplicateUsername = true;
            }
          }
          if (duplicateUsername) {
            res.status(400).json({success: false, error: 'A user with this username already exists'});
          } else {
            const updatedInfo = req.body;
            Object.keys(updatedInfo).forEach((key) => {
              user[key] = updatedInfo[key];
            });
            user.save();
            res.json({success: true});
          }
        } catch (err) {
          console.log(err);
          res.status(500).json({success: false, error: 'Server error'});
        }
      } else {
        res.status(400).json({success: false, error: 'Invalid inputs'});
      }
    });

router.post('/update/credentials',
    body('newPassword').matches(process.env.PASSWORD_REGEX),
    async (req, res) => {
      const validationErrors = validationResult(req);
      if (validationErrors.isEmpty()) {
        const matchesReenter = req.body.newPassword === req.body.rePassword;
        if (matchesReenter) {
          const userId = req.user.user_id;
          try {
            const user = await User.findOne({user_id: userId});
            const matchesCurrent = await bcrypt.compare(req.body.currentPassword, user.password);
            if (matchesCurrent) {
              const passwordSalt = await bcrypt.genSalt(10);
              const hashedNewPassword = await bcrypt.hash(req.body.newPassword, passwordSalt);
              user.password = hashedNewPassword;
              user.save();
              res.json({success: true});
            } else {
              res.status(401).json({success: false, error: 'Entered current password is incorrect.'});
            }
          } catch (err) {
            console.log(err);
            res.status(500).json({success: false, error: 'Server error'});
          }
        } else {
          res.status(400).json({success: false, error: 'New password does not match re-entered password.'});
        }
      } else {
        res.status(400).json({success: false, error: 'Invalid format for new password. Should have no spaces, minimum length of 6, and at least 1 uppercase letter, 1 lowercase letter, and 1 number.'});
      }
    });

module.exports = router;
