require("dotenv").config();
const passport = require("passport");
const GitHubStrategy = require("passport-github").Strategy;
const express = require("express");
const app = express();
const port = 3000;
const path = require("path");
const firebase = require("firebase/app");
const sha256 = require("js-sha256").sha256;
const exphbs = require("express-handlebars");
const authenticated = require("connect-ensure-login").ensureLoggedIn;
require("firebase/auth");
require("firebase/database");

const fb = firebase.initializeApp(require("./firebase.json"));
const db = fb.database("https://epigeon-9a57e.firebaseio.com/");

firebase
  .auth()
  .signInWithEmailAndPassword(
    process.env.FIREBASE_USER_EMAIL,
    process.env.FIREBASE_USER_PASSWORD
  );

passport.use(
  new GitHubStrategy(
    {
      clientID: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      callbackURL: "http://127.0.0.1:3000/auth/github/callback"
    },
    function(accessToken, refreshToken, profile, cb) {
      return cb(null, {
        service: "Github",
        accessToken,
        refreshToken,
        profile
      });
    }
  )
);
passport.serializeUser(function(user, cb) {
  cb(null, user);
});

passport.deserializeUser(function(obj, cb) {
  cb(null, obj);
});
app.use(express.static("static"));
app.engine("handlebars", exphbs());
app.set("view engine", "handlebars");
app.use(require("cookie-parser")());
app.use(require("body-parser").urlencoded({ extended: true }));
app.use(
  require("express-session")({
    secret: "keyboard cat",
    resave: true,
    saveUninitialized: true
  })
);

// Initialize Passport and restore authentication state, if any, from the
// session.
app.use(passport.initialize());
app.use(passport.session());

app.get("/auth/github", passport.authenticate("github"));

app.get(
  "/auth/github/callback",
  passport.authenticate("github", { failureRedirect: "/" }),
  function(req, res) {
    // Successful authentication, redirect home.
    res.redirect("/profile");
  }
);

app.post("/add", require("connect-ensure-login").ensureLoggedIn(), function(
  req,
  res
) {
  const ref = db.ref();
  const userCollection = ref.child(
    sha256(`${req.user.service}+${req.user.profile.id}`)
  );
  const counter = userCollection.push({
    view: 0,
    read: 0,
    date: Date.now(),
    until: Date.now() + 1100000
  });
});

app.get("/list", require("connect-ensure-login").ensureLoggedIn(), function(
  req,
  res
) {
  const ref = db.ref();
  const userCollection = ref.child(
    sha256(`${req.user.service}+${req.user.profile.id}`)
  );
  userCollection.once("value", function(counters) {
    res.json(counters);
  });
});

app.get("/", function(req, res) {
  res.render("home");
});

app.get("/profile", authenticated("/"), function(req, res) {
  const userCollectionId = sha256(`${req.user.service}+${req.user.profile.id}`);
  const ref = db.ref();
  const userCollection = ref.child(userCollectionId);
  userCollection.once("value", function(counters) {
    console.log(counters.val());
    res.render("profile", { userCollectionId, links: counters.val() });
  });
});

app.get("/counter/:user/:counter.svg", function(req, res) {
  const ref = db.ref();
  const userCollection = ref.child(`${req.params.user}/${req.params.counter}`);
  let counter;
  new Promise((resolve, reject) => {
    userCollection.on("value", function(data) {
      resolve(data.val());
    });
  })
    .then(data => {
      data.view++;
      userCollection.set(data);
      counter = data;
    })
    .finally(() => {
      res.set("Content-Type", "image/svg+xml");

      res.send(`
        <svg  xmlns="http://www.w3.org/2000/svg" height="30" width="200">
        <text x="0" y="15" fill="red">View: ${counter.view}</text>
        <text x="0" y="30" fill="red">Read: ${counter.read}</text>
        Sorry, your browser does not support inline SVG.
        </svg>
        `);
    });
});

app.listen(port, () => console.log(`Example app listening on port ${port}!`));
