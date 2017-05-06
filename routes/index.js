var express = require('express');
var crypto = require('crypto');
var settings = require('../settings');
var flash = require('connect-flash');
var session = require('express-session');
var User = require('../models/user');
var Post = require('../models/post');
var markdown = require('markdown').markdown;
var multer = require('multer');
var upload = multer({
  dest: './public/img'
});
var router = express.Router();

router.use(session({
  secret: settings.cookieSecret,  //加密
  key: settings.db, //cookie nam
  cookie: {maxAge: 600000},
  resave: false,
  saveUninitialized: true,
  // store: new User({
  //     dbs:settings.db,
  //     host:settings.host,
  //     port:settings.port,
  // })
}));
router.use(flash());

router.use(function (req, res, next) {
  res.locals.errors = req.flash('error');
  res.locals.infos = req.flash('success');
  next();
});

//写入数据到数据库
function getSave(user, callback) {
  user.save(function (err, obj) {
    if (err) {
      //console.log("getSave Error:" + err);
      return callback(err);
    } else {
      //console.log("getSave Res:" + obj);
      return callback(null, obj);
    }
  });
}
//查询登录用户数据库
function getByDB(user, callback) {
  var whereObj = {username: user.username};
  User.findOne(whereObj, function (err, obj) {
    if (err) {
      //console.log("getByConditions Error:" + err);
      return callback(err);
    }
    else {
      //console.log("getByConditions Res:" + obj);
      return callback(null, obj);
    }
  })
}
//查询发布文章转换成html数据
function getPostByDB(user, callback) {
  var whereObj = user === null ? {} : user;
  Post.find(whereObj, function (err, posts) {
    if (err) {
      return callback(err);
    }
    else {
      // console.log("getByConditions Res111:" + posts);
      Post.update(whereObj,{$inc:{'pv': 1}},function (err) {
          if(err){
            return callback(err);
          }
      });
      posts.forEach(function (doc) {
        doc.post = markdown.toHTML(doc.post);
        doc.comments.forEach(function (comment) {
          comment.content = markdown.toHTML(comment.content);
        });
      });
      // console.log("getByConditions Res2222:" + posts);
      return callback(null, posts);
    }
  });
}
//查询发布文章markdown数据
function getPostMdByDB(user, callback) {
  var whereObj = user === null ? {} : user;
  Post.find(whereObj, function (err, posts) {
    if (err) {
      //console.log("getByConditions Error:" + err);
      return callback(err);
    }
    else {
      //console.log("getByConditions Res:" + posts);
      return callback(null, posts);
    }
  });
}
//更新发布文章数据库
function updatePostByDB(user, post, callback) {
  var whereObj = user === null ? {} : user;
  var updateObj = post;
  Post.update(whereObj, updateObj, function (err, posts) {
    if (err) {
      //console.log("getByConditions Error:" + err);
      return callback(err);
    }
    else {
      //console.log("getByConditions Res:" + posts);
      return callback(null, posts);
    }
  });
}
//删除发布文章
function removePostByDB(user, callback) {
  console.log("User: " + user);
  Post.remove(user, function (err, posts) {
    if (err) {
      //console.log("getByConditions Error:" + err);
      return callback(err);
    }
    else {
      //console.log("getByConditions Res:" + posts);
      return callback(null, posts);
    }
  });
}
//分页效果
function getByPager(user, page, callback) {
  var query = user === null ? {} : user;
  Post.count(query,function (err, total) {
    //console.log('Total: '+total);
    Post.find(query).skip((page - 1)*5).limit(5).sort({date:-1}).exec(function (err,docs) {
      if(err){
        return callback(err);
      }
      docs.forEach(function (doc) {
        doc.post = markdown.toHTML(doc.post);
      });
      //console.log('Docs: '+docs);
      callback(null,docs,total);
    });
  });
}
//返回所有文章的存档信息
function getArchive(callback){
  Post.find({},{username:1,date:1,title:1}).sort({date:-1}).exec(function (err, docs) {
    if(err){
      return callback(err);
    }
    callback(null,docs);
  })
}
//返回所有标签
function getTags(callback){
    Post.distinct('tags', function (err, docs) {
        if(err){
            return callback(err);
        }
        callback(null,docs);
    })
}
//返回含有特定标签的文章
function getTag(tag, callback){
    Post.find({tags:tag},{username:1,date:1,title:1}).sort({date:-1}).exec(function (err, docs) {
        if(err){
            return callback(err);
        }
        callback(null,docs);
    })
}
//返回通过标题关键字查询的所有文章
function search(keyword, callback){
  var pattern = new RegExp(keyword, 'i');
    Post.find({title:pattern},{username:1,date:1,title:1}).sort({date:-1}).exec(function (err, docs) {
        if(err){
            return callback(err);
        }
        callback(null,docs);
    })
}
/* GET home page. */
router.get('/', function (req, res) {
  var page = req.query.p ? parseInt(req.query.p) : 1;
  getByPager(null,page,function (err,posts,total) {
    if(err){
      posts = [];
    }
    res.render('index', {
      title: '主页',
      posts: posts,
      page:page,
      isFirstPage:(page - 1) === 0,
      isLastPage:((page - 1) * 5 + posts.length) === total,
      user: req.session.user,
      success: req.flash('success').toString(),
      error: req.flash('error').toString(),
    });
  });
});
router.get('/reg', checkNotLogin);
router.get('/reg', function (req, res) {
  res.render('reg', {
    title: '注册',
    user: req.session.user,
    success: req.flash('success').toString(),
    error: req.flash('error').toString(),
  });
});
router.post('/reg', checkNotLogin);
router.post('/reg', function (req, res) {
  var name = req.body.name;
  var email = req.body.email;
  var pw = req.body.pw;
  var pw_re = req.body['pw-re'];
  //校验密码是否一致
  if (pw !== pw_re) {
    req.flash('error', '密码不一致');
    return res.redirect('/reg');
  }
  //生成密码的md5值
  var md5 = crypto.createHash('md5');
  pw = md5.update(pw).digest('hex');
  var user = new User({
    username: name,
    userpwd: pw,
    useremail: email,
  });
  getByDB(user, function (err, obj) {
    if (err) {
      req.flash('error', err);
      return res.redirect('/');
    }
    if (obj === null) {
      getSave(user, function (err, dbUser) {
        if (err) {
          req.flash('error', err);
          return res.redirect('/');
        }
        req.session.user = dbUser; //用户信息存入session
        //console.log('恭喜你，注册成功 : ' + req.session.user);
        req.flash('success', '恭喜你，注册成功');
        res.redirect('/');
      });
    } else {
      req.flash('error', '用户已经存在了');
      res.redirect('/reg');
    }
  });
});
router.get('/login', checkNotLogin);
router.get('/login', function (req, res) {
  res.render('login', {
    title: '登录',
    user: req.session.user,
    success: req.flash('success').toString(),
    error: req.flash('error').toString(),
  });
});
router.post('/login', checkNotLogin);
router.post('/login', function (req, res) {
  var name = req.body.name;
  var pw = req.body.pw;
  //生成密码的md5值
  var md5 = crypto.createHash('md5');
  pw = md5.update(pw).digest('hex');
  var user = new User({
    username: name,
    userpwd: pw,
  });
  getByDB(user, function (err, obj) {
    if (err) {
      req.flash('error', err);
      return res.redirect('/');
    }
    if (obj === null) {
      req.flash('error', '用户已经不存在');
      return res.redirect('/login');
    }
    if (obj.userpwd !== pw) {
      req.flash('error', '密码错误');
      return res.redirect('/login');
    }
    req.session.user = obj; //用户信息存入session
    //console.log('恭喜你，登录成功 : ' + req.session.user);
    req.flash('success', '恭喜你，登录成功');
    res.redirect('/');
  });
});
router.get('/post', checkLogin);
router.get('/post', function (req, res) {
  res.render('post', {
    title: '发布文章',
    user: req.session.user,
    success: req.flash('success').toString(),
    error: req.flash('error').toString(),
  });
});
router.post('/post', checkLogin);
router.post('/post', function (req, res) {
  var date = new Date();
  var time = {
    date: date,
    year: date.getFullYear(),
    month: date.getFullYear() + '-' + (date.getMonth() + 1),
    day: date.getFullYear() + '-' + (date.getMonth() + 1) + '-' + date.getDate(),
    minute: date.getFullYear() + '-' + (date.getMonth() + 1) + '-' + date.getDate() + ' ' + (date.getHours() < 10 ? '0' + date.getHours() : date.getHours()) + ':' + (date.getMinutes() < 10 ? '0' + date.getMinutes() : date.getMinutes()),
  };
  var currentUser = req.session.user;
  var tags = [req.body.tag1,req.body.tag2,req.body.tag3];
  var post = new Post({
    date: time,
    username: currentUser.username,
    title: req.body.title,
    tags: tags,
    post: req.body.post,
  });
  getSave(post, function (err) {
    if (err) {
      req.flash('error', err);
      return res.redirect('/post');
    }
    req.flash('success', '恭喜你，发布成功');
    res.redirect('/');
  });
});
router.get('/logout', checkLogin);
router.get('/logout', function (req, res) {
  req.session.user = null;
  req.flash('success', '登出成功');
  res.redirect('/');
});
router.get('/upload', checkLogin);
router.get('/upload', function (req, res) {
  res.render('upload', {
    title: '上传文件',
    user: req.session.user,
    success: req.flash('success').toString(),
    error: req.flash('error').toString(),
  });
});
router.post('/upload', checkLogin);
router.post('/upload', upload.array('file', 5), function (req, res) {
  req.flash('success', '恭喜你，上传成功');
  res.redirect('/upload');
});
router.get('/u/:name', function (req, res) {
  var user = {
    username: req.params.name
  };
  var page = req.query.p ? parseInt(req.query.p) : 1;
  getByPager(user,page,function (err,posts,total) {
    if(err){
      req.flash('error', err);
      return res.redirect('/');
    }
    res.render('index', {
      title: '主页',
      posts: posts,
      page:page,
      isFirstPage:(page - 1) === 0,
      isLastPage:((page - 1) * 5 + posts.length) === total,
      user: req.session.user,
      success: req.flash('success').toString(),
      error: req.flash('error').toString(),
    });
  });
  /*if(!req.session.user){
   req.flash('error', '请登录');
   return res.redirect('/');
   }*/
  /*getPostByDB(user, function (err, posts) {
    if (err) {
      posts = [];
      req.flash('error', 'err');
      return res.redirect('/');
    }
    res.render('index', {
      title: user.username,
      user: req.session.user,
      posts: posts,
      success: req.flash('success').toString(),
      error: req.flash('error').toString(),
    });
  });*/
});
router.get('/u/:name/:day/:title', function (req, res) {
  console.log(req.params.title);
  var user = {
    username: req.params.name,
    'date.day': req.params.day,
    title:decodeURIComponent(req.params.title),
  };
  //console.log(user);
  /*if(!req.session.user){
   req.flash('error', '请登录');
   return res.redirect('/');
   }*/
  getPostByDB(user, function (err, posts) {
    if (err) {
      req.flash('error', 'err');
      return res.redirect('/');
    }
    //console.log('posts: '+posts);
    res.render('article', {
      title: req.params.title,
      user: req.session.user,
      post: posts[0],
      success: req.flash('success').toString(),
      error: req.flash('error').toString(),
    });
  });
});
router.post('/u/:name/:day/:title', function (req, res) {
    if (!req.session.user) {
        req.flash('error', '未登录！');
        return res.redirect('/login');
    }
  var date = new Date();
  var time = date.getFullYear() + '-' + (date.getMonth() + 1) + '-' + date.getDate() + ' ' + (date.getHours() < 10 ? '0' + date.getHours() : date.getHours()) + ':' + (date.getMinutes() < 10 ? '0' + date.getMinutes() : date.getMinutes());
  var comment = {
    name: req.body.name,
    email: req.body.email,
    website: req.body.website,
    time: time,
    content: req.body.content,
  };
  var user = {
    username: req.params.name,
    'date.day': req.params.day,
    title: req.params.title,
  };
  getPostByDB(user,function(err, posts){
    if(err){
      req.flash('error', 'err');
      return res.redirect('back');
    }
    console.log(posts[0].comments.push(comment));
    updatePostByDB(user, {$push:{'comments':comment}}, function (err, commentss) {
      if (err) {
        req.flash('error', 'err');
        return res.redirect('back');
      }
      console.log('留言成功'+commentss);
      req.flash('success', '恭喜你, 留言成功!');
      res.redirect('back');
    });
  });
});
router.get('/edit/:name/:day/:title', checkLogin);
router.get('/edit/:name/:day/:title', function (req, res) {
  var currentUser = req.session.user;
  var user = {
    username: currentUser.username,
    'date.day': req.params.day,
    title: req.params.title
  };
  getPostMdByDB(user, function (err, posts) {
    if (err) {
      req.flash('error', 'err');
      return res.redirect('/');
    }
    res.render('edit', {
      title: '编辑',
      user: req.session.user,
      post: posts[0],
      success: req.flash('success').toString(),
      error: req.flash('error').toString(),
    });
  });
});
router.post('/edit/:name/:day/:title', checkLogin);
router.post('/edit/:name/:day/:title', function (req, res) {
  var currentUser = req.session.user;
  var user = {
    username: currentUser.username,
    'date.day': req.params.day,
    title: req.params.title
  };
  updatePostByDB(user, {'post': req.body.post}, function (err, posts) {
    var url = encodeURI('/u/' + req.params.name + '/' + req.params.day + '/' + req.params.title);
    if (err) {
      req.flash('error', 'err');
      return res.redirect(url);
    }
    req.flash('success', '恭喜你，修改成功');
    res.redirect(url);
  });
});
router.get('/remove/:name/:day/:title', checkLogin);
router.get('/remove/:name/:day/:title', function (req, res) {
  var currentUser = req.session.user;
  var user = {
    username: currentUser.username,
    'date.day': req.params.day,
    title: req.params.title
  };
  console.log('GetUser: ' + user.username);
  removePostByDB(user, function (err, posts) {
    if (err) {
      req.flash('error', 'err');
      return res.redirect('back');
    }
    req.flash('success', '恭喜你，删除成功');
    res.redirect('/');
  })
});
router.get('/archive', function (req, res) {
  getArchive(function (err,posts) {
    if(err){
      req.flash('error',err);
      return res.redirect('/');
    }
    res.render('archive', {
      title:'存档',
      posts:posts,
      user:req.session.user,
      success: req.flash('success').toString(),
      error: req.flash('error').toString(),
    });
  });
});
router.get('/tags', function (req,res) {
    getTags(function (err, posts) {
        if(err){
            req.flash('error', err);
            return res.redirect('/');
        }
        res.render('tags', {
            title: '标签',
            posts: posts,
            user: req.session.user,
            success: req.flash('success').toString(),
            error: req.flash('error').toString(),
        });
    });
});
router.get('/tags/:tag',function (req,res) {
    getTag(req.params.tag,function (err,posts) {
        if(err){
            req.flash('error', err);
            return res.redirect('/');
        }
        res.render('tag', {
            title: '标签: ' + req.params.tag,
            posts: posts,
            user: req.session.user,
            success: req.flash('success').toString(),
            error: req.flash('error').toString(),
        });
    })
});

function checkLogin(req, res, next) {
  if (!req.session.user) {
    req.flash('error', '未登录！');
    return res.redirect('/login');
  }
  next();
}

function checkNotLogin(req, res, next) {
  if (req.session.user) {
    req.flash('error', '已登录！');
    return res.redirect('back');//返回之前的页面
  }
  next();
}
module.exports = router;
