import express from "express";
import bodyParser from "body-parser";
import * as admin from "./admin.js";
import Razorpay from "razorpay";
import multer from "multer";
import nodemailer from "nodemailer";
import crypto from "crypto";
import pg from "pg";
import jwt from "jsonwebtoken";
import path from "path";
import cookieParser from "cookie-parser";
import bcrypt from "bcryptjs";
import axios from "axios";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { OAuth2Client } from "google-auth-library";
import dotenv from 'dotenv';
dotenv.config();
// import mysql from 'mysql2';
const app = express();
const _dirname = dirname(fileURLToPath(import.meta.url));
const port = 3000;
// iss niche wala ko use kar sakte hai agar hum google ka oauth2 use karna ho toh.
const CLIENT_ID =
  process.env.googleClientId;
const Client = new OAuth2Client(CLIENT_ID);

// const razorpay = new Razorpay({
//   key_id: process.env.razorPayKeyId, // Replace with your Razorpay key id
//   key_secret: process.env.razorPayKeySecret, // Replace with your Razorpay key secret
// });

app.set("view engine", "ejs");
app.set("views", _dirname + "/views"); // Set the path to the views directory
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(_dirname + "/public"));
const Secret_key = process.env.jwtSecretKey;

const db = new pg.Client({
  host:process.env.databaseHost,
  password: process.env.databasePassword,
  database: "vsa",
  port: 4000,
  user: "postgres",
});

// Create the connection to the database
// const connection = mysql.createConnection({
//   host: 'localhost', // Your database host
//   user: 'root',      // Your database user
//   password: 'password', // Your database password
//   database: 'database_name' // Your database name
// });

// Connect to the database
// connection.connect((err) => {
//   if (err) {
//     console.error('Error connecting to the database:', err.stack);
//     return;
//   }
//   console.log('Connected to the database as id ' + connection.threadId);
// });

// export default connection;

// below is the middle ware to prevent caching of authenticated pages iske wajah se back button dabane per re logged in page pe nhi jayega
app.use((req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

app.get("/newLogin", (req, res) => {
  res.render("login.ejs");
  console.log("Successfully rendered login page");
});

// yaha pe signup kai hai.
// app.post("/SignUp", async (req, res) => {
//   const { FullName, SignUp_Email, SignUp_Password, Mobile_number } = req.body;
//   const saltRounds = 10;
//   try {
//     const salt = await bcrypt.genSalt(saltRounds);
//     const hashedPassword = await bcrypt.hash(SignUp_Password, salt);
//     const firstName = FullName.split(" ")[0];
//     var i = 0; // this is for user id
//     let user_id = i++;
//     try {
//       const duplicateCheck = await db.query(
//         `SELECT * FROM users WHERE email=$1 AND password_entered=$2;`,
//         [SignUp_Email, SignUp_Password]
//       );

//       if (duplicateCheck.rows.length > 0) {
//         res.render("login.ejs", {
//           signUp_ToolTip: true,
//         });
//         console.log("Duplicate found");
//       } else {
//         await db.query(
//           "INSERT INTO users (full_name,email,password_entered,mobile_number,user_id) VALUES ($1,$2,$3,$4,$5)",
//           [FullName, SignUp_Email, hashedPassword, Mobile_number, user_id]
//         );
//         res.render("index.ejs", {
//           Login: firstName,
//         });
//         console.log("Added to the database");
//       }
//     } catch (error) {
//       console.log("User signUp problem Couldn't add to database" + error);
//       res.render("login.ejs", {
//         signUp_ToolTip: true,
//       });
//     }
//   } catch (error) {
//     console.error("Error during sign up:", error);
//     res.render("login.ejs", {
//       errorMessage: "An error occurred during sign up, please try again.",
//     });
//   }
// });

//for signup but with email validation code using nodemailer it is sending the mail to the user i have to create 
// /verify-email endpoint to make it work further and have to add the login endpoint in it and also update the is_verified to true in the database
app.post("/SignUp", async (req, res) => {
  const { FullName, SignUp_Email, SignUp_Password, Mobile_number } = req.body;
  const saltRounds = 10;
  try {
    // Hashing the password
    const salt = await bcrypt.genSalt(saltRounds);
    const hashedPassword = await bcrypt.hash(SignUp_Password, salt);
    const firstName = FullName.split(" ")[0];    
    // Check if the email already exists in the database
    // console.log(SignUp_Email);
    const duplicateCheck = await db.query(
      `SELECT * FROM users WHERE email=$1;`,
      [SignUp_Email]
    );

    console.log("Duplicate check result:", duplicateCheck.rows);

    if (duplicateCheck.rows.length > 0) {
      res.render("login.ejs", { signUp_ToolTip: true });
      console.log("Duplicate email found");
    } else {
      // Generate email verification token
      const verificationToken = crypto.randomBytes(32).toString('hex');

      // Insert user with verification token and 'isVerified' flag set to false
      await db.query(
        "INSERT INTO users (full_name, email, password_entered, mobile_number, verification_token, is_verified) VALUES ($1, $2, $3, $4, $5, $6)",
        [FullName, SignUp_Email, hashedPassword, Mobile_number, verificationToken, false]
      );

      // Send verification email
      const transporter = nodemailer.createTransport({
        service: 'gmail', // You can use other services too like Outlook, SMTP etc.
        auth: {
          user: process.env.nodeMailerEmailValidatorEmail, // Your email
          pass: process.env.nodeMailerEmailValidatorPass  // Your email password or app password
        }
      });

      const verificationLink = `http://localhost:3000/verify-email?token=${verificationToken}`;

      const mailOptions = {
        from: process.env.nodeMailerEmailValidatorEmail,
        to: SignUp_Email,
        subject: 'Verify your email for sign-up',
        html: `<p>Hi ${firstName},</p>
               <p>Please click the link below to verify your email:</p>
               <a href="${verificationLink}">Verify Email</a>`
      };

      await transporter.sendMail(mailOptions);

      // Inform the user to check their email for verification
      res.render("login.ejs", {
        signUp_ToolTip: false,
        // infoMessage: "Check your email to verify your account."
      });
      console.log("User added to database and verification email sent.");

    }
  } catch (error) {
    console.error("Error during sign up:", error);
    res.render("login.ejs", {
      errorMessage: "An error occurred during sign up, please try again."
    });
  }
});
//this below is the end for when the user clicks on the link sent to him in mail for email verification
// app.get('/verify-email', async (req, res) => {
//   const { token, email } = req.query;

//   try {
//     const result = await db.query(
//       'SELECT * FROM users WHERE email=$1 AND verification_token=$2',
//       [email, token]
//     );

//     if (result.rows.length > 0) {
//       // Update user as verified
//       await db.query(
//         'UPDATE users SET is_verified=true WHERE email=$1',
//         [email]
//       );

//       res.render('login.ejs', {
//         message: 'Your email has been verified! You can now log in.',
//       });
//     } else {
//       res.render('login.ejs', {
//         errorMessage: 'Invalid or expired token.',
//       });
//     }
//   } catch (error) {
//     console.error('Error during email verification:', error);
//     res.render('login.ejs', {
//       errorMessage: 'An error occurred during email verification, please try again.',
//     });
//   }
// });
app.post("/Login", async (req, res) => {
  const { Email, Password } = req.body;
  try {
    const enteredDetails = await db.query("SELECT * FROM users WHERE email=$1;", [Email]);
    if (enteredDetails.rows.length > 0) {
      const userCheck = enteredDetails.rows[0];
      if (userCheck.admin === true) {
        console.log("User is admin");
          const PassCheck = await bcrypt.compare(Password, userCheck.password_entered);
        if (PassCheck) {
          const firstName = userCheck.full_name.split(" ")[0];
          const token = jwt.sign(
            {
              Email: userCheck.email,
              fullName: userCheck.full_name,
              user_id: userCheck.id,
            },
            Secret_key,
            { expiresIn: "3d" }
          );

          res.cookie("token", token, { httpOnly: true, secure: true });
          console.log(token);
          admin.adminRole(req,res,firstName);
        } else {
          console.log("Invalid Credentials");
          res.render("login.ejs", {
            login_toolTip: true,
          });
        }
      } else {
        console.log("userCheck:", userCheck); // Debugging log

        const PassCheck = await bcrypt.compare(Password, userCheck.password_entered);

        if (PassCheck) {
          const firstName = userCheck.full_name.split(" ")[0];
          const token = jwt.sign(
            {
              Email: userCheck.email,
              fullName: userCheck.full_name,
              user_id: userCheck.id,
            },
            Secret_key,
            { expiresIn: "3d" }
          );

          res.cookie("token", token, { httpOnly: true, secure: true });
          console.log(token);
          res.render("index.ejs", {
            Login: firstName,
          });
        } else {
          console.log("Invalid Credentials");
          res.render("login.ejs", {
            login_toolTip: true,
          });
        }
      }
    } else {
      console.log("User does not exist");
      res.render("login.ejs", {
        login_toolTip1: true,
      });
    }
  } catch (error) {
    console.error("Error logging in:", error);
    res.render("login.ejs", {
      errorMessage: "An error occurred, please try again.",
    });
  }
});

// yaha pe google se signIn kai hai.
// ISKO ABHI DEKHNA HAI.
app.post("/auth/google", async (req, res) => {
  const { id_token, googleId, googleName, googleProfileImg, googleEmail } =
    req.body;
  console.log("Google auth request received:", {
    id_token,
    googleId,
    googleName,
    googleProfileImg,
    googleEmail,
  });

  try {
    const ticket = await Client.verifyIdToken({
      idToken: id_token,
      audience: CLIENT_ID,
    });
    const payload = ticket.getPayload();
    console.log("Google payload:", payload);

    const userResult = await db.query("SELECT * FROM users WHERE email=$1", [
      googleEmail,
    ]);
    if (userResult.rows.length > 0) {
      console.log("User already exists via Google");
      res.redirect("/");
    } else {
      await db.query(
        "INSERT INTO users (full_name, email, user_id) VALUES ($1, $2, $3)",
        [googleName, googleEmail, googleId]
      );

      const newUser = await db.query("SELECT * FROM users WHERE email=$1", [
        googleEmail,
      ]);
      const token = jwt.sign(
        {
          Email: googleEmail,
          fullName: googleName,
          user_id: newUser.rows[0].user_id,
        },
        Secret_key,
        { expiresIn: "3d" }
      );
      res.cookie("token", token, { httpOnly: true, secure: true });
      console.log("User successfully registered via Google, token set");
      res.redirect("/");
    }
  } catch (error) {
    console.error("Error handling Google authentication:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal Server Error" });
  }
});

// Below is the middleware that authenticates the jwt token
const authenticateUser = (req, res, next) => {
  const token = req.cookies.token;

  if (!token) {
    console.log("Token not found");
    req.user = null;
    // return res.status(401).send("Not authenticated");
    return next();
  }

  jwt.verify(token, Secret_key, (err, decoded) => {
    if (err) {
      console.error("Token verification failed:", err);
      return res.status(401).send("Invalid token");
    }

    // Attach decoded user information to the request object
    req.user = decoded;
    next();
  });
};
app.get("/", authenticateUser,async (req, res) => {
  if (req.user) {
    const firstName = req.user.fullName.split(" ")[0];
    const {rows:homePageData}=await db.query("SELECT * FROM home_page_data");
    res.render("index.ejs", {
      Login: firstName,
      homePageData:homePageData,
    });

    console.log(
      `Successfully opened Home with user logged in: ${req.user.fullName}`
    );
  } else {
    const {rows:homePageData}=await db.query("SELECT * FROM home_page_data");
    res.render("index.ejs", {
      Login: null,
      homePageData:homePageData,
    });
    console.log("Sucessfully opened Home without user logged in");
  }
});
// yaha pe shop ka hai.
app.get("/Shop", authenticateUser, async (req, res) => {
  if (req.user) {
    const firstName = req.user.fullName.split(" ")[0];
    try {
      const { rows: item_data } = await db.query("SELECT * FROM stock_skates");
      console.log(
        "Stocks successfully retrieved from database with user login"
      );
      res.render("Shop.ejs", {
        Login: firstName,
        items_data: item_data,
      });
      console.log(
        "Sucessfully opened shop with user log in and item displayed"
      );
    } catch (error) {
      console.log("Unable to retrive stock", error);
    }
  } else {
    const { rows: item_data } = await db.query("SELECT * FROM stock_skates");
    console.log(
      "Stocks successfully retrieved from database without user login"
    );
    res.render("Shop.ejs", {
      Login: null,
      items_data: item_data,
    });
    console.log("Sucessfully opened shop without user logged in");
  }
});
// yaha pe subscription ka hai.
app.get("/Subscription", authenticateUser, (req, res) => {
  res.render("joinUs.ejs");
});
// contact us mei map daalna hai.
// yaha pe buy karne ke liye hai.
app.get("/Buy_Now", authenticateUser, async (req, res) => {
  if (req.user) {
    const firstName = req.user.fullName.split(" ")[0];
    const purchasedItem = await db.query(
      "SELECT * FROM orders WHERE email=$1",
      [req.user.Email]
    );
    if (purchasedItem.rows.length > 0) {
      res.render("checkout.ejs", {
        Login: firstName,
        purchasing_item: purchasedItem,
      });
    }
  }
});
// Endpoint to handle payment success
app.post("/payment_success", async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
    req.body;

  // Verification of payment signature
  const hmac = crypto.createHmac("sha256", "YOUR_RAZORPAY_SECRET");
  hmac.update(razorpay_order_id + "|" + razorpay_payment_id);
  const generated_signature = hmac.digest("hex");

  if (generated_signature === razorpay_signature) {
    // Payment verified
    try {
      // Find the order with the given Razorpay order ID and mark it as paid
      const order = await db.query("SELECT * FROM orders WHERE order_id = $1", [
        razorpay_order_id,
      ]);

      if (order.rows.length === 0) {
        return res
          .status(404)
          .json({ success: false, error: "Order not found" });
      }

      const orderDetails = order.rows[0];
      const { item_id, item_type, quantity } = orderDetails;

      // Update stock quantity
      await db.query(
        `UPDATE stock_${item_type} SET quantity = quantity - $1 WHERE item_id = $2`,
        [quantity, item_id]
      );

      // Update order status to 'completed'
      await db.query(
        "UPDATE orders SET status = 'completed', payment_id = $1 WHERE order_id = $2",
        [razorpay_payment_id, razorpay_order_id]
      );

      res.json({ success: true });
    } catch (error) {
      console.error("Error processing payment:", error);
      res.status(500).json({ success: false, error: "Database update failed" });
    }
  } else {
    res
      .status(400)
      .json({ success: false, error: "Signature verification failed" });
  }
});

app.post("/Buy_Now", authenticateUser, async (req, res) => {
  const { item_id, item_type, quantity } = req.body;

  if (!req.user) {
    console.log("User not logged in, unable to process purchase.");
    return res
      .status(401)
      .render("login.ejs", {
        message: "You must be logged in to purchase items.",
      });
  }

  try {
    // Check user details
    const user_check = await db.query("SELECT * FROM users WHERE email = $1", [
      req.user.Email,
    ]);
    const user_check_address = await db.query(
      "SELECT * FROM users_address WHERE email = $1",
      [req.user.Email]
    );

    if (user_check.rows.length === 0 || user_check_address.rows.length === 0) {
      console.log("User or address details not found.");
      return res
        .status(404)
        .json({ error: "User or address details not found." });
    }

    const { name: full_name, email, mobile_number } = user_check.rows[0];
    const { address, zip_code, city, state } = user_check_address.rows[0];

    // Check item stock
    const itemCheck = await db.query(
      `SELECT * FROM stock_${item_type} WHERE item_id = $1`,
      [item_id]
    );

    if (itemCheck.rows.length === 0) {
      console.log("Item not found.");
      return res.status(404).json({ error: "Item not found." });
    }

    const purchase = itemCheck.rows[0];
    const newQuantity = Math.min(parseInt(quantity), purchase.quantity);

    if (quantity > purchase.quantity) {
      console.log("Number of items exceeds stock limit.");
    }

    // Insert into orders with a pending status
    await db.query(
      "INSERT INTO orders (name, email, mobile_number, address, zip_code, city, state, item_id, item_type, price, quantity, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'pending')",
      [
        full_name,
        email,
        mobile_number,
        address,
        zip_code,
        city,
        state,
        item_id,
        item_type,
        purchase.price,
        newQuantity,
      ]
    );

    // Create Razorpay order
    const orderOptions = {
      amount: purchase.price * newQuantity, // amount in the smallest currency unit
      currency: "INR",
      receipt: `receipt_order_${item_id}_${Date.now()}`,
    };

    const order = await razorpay.orders.create(orderOptions);

    res.status(200).json({
      id: order.id,
      currency: order.currency,
      amount: order.amount,
      full_name,
      email,
      mobile_number,
      address,
    });
  } catch (error) {
    console.error("Error processing purchase:", error);
    res
      .status(500)
      .json({ error: "An error occurred while processing your purchase." });
  }
});

// yaha pe items ki product details kholne ka hai.
app.get("/productDetails", authenticateUser, async (req, res) => {
  try {
    const firstName = req.user.fullName.split(" ")[0];      
    const { item_id, item_type } = req.query;
    console.log(item_id, item_type);
    const data = await db.query(`SELECT * FROM stock_${item_type} WHERE item_id=$1`, [item_id]);
    const result = data.rows;

    if (!result.length) {
        return res.status(404).send("Item not found");
    }

    res.render("product_Details.ejs", { itemDetails: result, Login: firstName });
  } catch (error) {
    console.error("Error fetching item for update:", error);
    res.status(500).send("An error occurred while fetching the item.");
  }
});

app.post("/productDetails", authenticateUser, async (req, res) => {
  try {
    if (req.user) {
      const { item_id, item_type } = req.body;
      const firstName = req.user.fullName.split(" ")[0];
      const data = await db.query(`SELECT * FROM stock_${item_type} WHERE item_id=$1`, [item_id]);
      const result = data.rows;

      if (!result.length) {
        return res.status(404).json({ success: false, message: "Item not found" });
      }

      res.json({ success: true, itemDetails: result, Login: firstName });
    } else {
      res.status(401).json({ success: false, message: "Unauthorized" });
    }
  } catch (error) {
    console.error("Error occurred:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.get("/Wheels", authenticateUser, async (req, res) => {
  if (req.user) {
    const firstName = req.user.fullName.split(" ")[0];
    try {
      const { rows: item_data } = await db.query("SELECT * FROM stock_wheels");
      console.log(
        "Stocks successfully retriedved Wheels from database with user login"
      );
      res.render("Shop.ejs", {
        Login: firstName,
        items_data: item_data,
      });
      console.log(
        "Sucessfully opened Wheels with user log in and item displayed"
      );
    } catch (error) {
      console.log("Unable to retrive stock", error);
    }
  } else {
    const { rows: item_data } = await db.query("SELECT * FROM stock_wheels");
    console.log(
      "Stocks successfully retriedved Wheels from database without user login"
    );
    res.render("Shop.ejs", {
      Login: null,
      items_data: item_data,
    });
    console.log("Sucessfully opened Wheels without user logged in");
  }
});
app.get("/Helmets", authenticateUser, async (req, res) => {
  if (req.user) {
    const firstName = req.user.fullName.split(" ")[0];
    try {
      const { rows: item_data } = await db.query("SELECT * FROM stock_helmets");
      // console.log(
      //   "Stocks successfully retrieved Helmets from database with user login",item_data
      // );

      res.render("Shop.ejs", {
        Login: firstName,
        items_data: item_data,
      });
      console.log(
        "Sucessfully opened Helmets with user log in and item displayed"
      );
    } catch (error) {
      console.log("Unable to retrive stock", error);
    }
  } else {
    const { rows: item_data } = await db.query("SELECT * FROM stock_helmets");
    console.log(
      "Stocks successfully retrieved Helmets from database without user login"
    );
    res.render("Shop.ejs", {
      Login: null,
      items_data: item_data,
    });
    console.log("Sucessfully opened Helmets without user logged in");
  }
});
app.get("/SkinSuits", authenticateUser, async (req, res) => {
  if (req.user) {
    const firstName = req.user.fullName.split(" ")[0];
    try {
      const { rows: item_data } = await db.query(
        "SELECT * FROM stock_skinsuits"
      );
      console.log(
        "Stocks successfully retriedved SkinSuits from database with user login"
      );
      res.render("Shop.ejs", {
        Login: firstName,
        items_data: item_data,
      });
      console.log(
        "Sucessfully opened SkinSuits with user log in and item displayed"
      );
    } catch (error) {
      console.log("Unable to retrive stock", error);
    }
  } else {
    const { rows: item_data } = await db.query("SELECT * FROM stock_skinsuits");
    console.log(
      "Stocks successfully retriedved SkinSuits from database without user login"
    );
    res.render("Shop.ejs", {
      Login: null,
      items_data: item_data,
    });
    console.log("Sucessfully opened SkinSuits without user logged in");
  }
});
app.get("/Accessories", authenticateUser, async (req, res) => {
  if (req.user) {
    const firstName = req.user.fullName.split(" ")[0];
    try {
      const { rows: item_data } = await db.query(
        "SELECT * FROM stock_accessories"
      );
      console.log(
        "Stocks successfully retriedved Accessories from database with user login"
      );
      res.render("Shop.ejs", {
        Login: firstName,
        items_data: item_data,
      });
      console.log(
        "Sucessfully opened Accessories with user log in and item displayed"
      );
    } catch (error) {
      console.log("Unable to retrive stock", error);
    }
  } else {
    const { rows: item_data } = await db.query(
      "SELECT * FROM stock_accessories"
    );
    console.log(
      "Stocks successfully retriedved Accessories from database without user login"
    );
    res.render("Shop.ejs", {
      Login: null,
      items_data: item_data,
    });
    console.log("Sucessfully opened Accessories without user logged in");
  }
});
app.get("/Skates", (req, res) => {
  res.redirect("/Shop");
  console.log("Succesfully redirected to shop ");
});
// app.get("/AddToCart",authenticateUser,async(req,res)=>{
//     if(req.user === null){
//         res.redirect("/newLogin");
//     }else{
//         res.render("shop.ejs",{

//         });
//     }
// });
// yaha pe item cart mei add karne ka hai.
app.get("/AddToCart", authenticateUser, async (req, res) => {
  // console.log(req.user);
  const user = req.user;
  // console.log(user);
  if (user === null) {
    res.redirect("/newLogin");
  }
});
app.post("/AddToCart", authenticateUser, async (req, res) => {
  if (!req.user || !req.user.Email) {
      return res.redirect("/newLogin");
  }

  try {
      const userResult = await db.query(`SELECT * FROM users WHERE email=$1`, [
          req.user.Email,
      ]);

      if (userResult.rows.length === 0) {
          console.log("User not found:", req.user.Email);
          return res.redirect("/newLogin");
      }

      const user = userResult.rows[0];
      const userId = user.user_id;

      if (!userId) {
          console.log("User ID is null");
          return res.status(500).send("User ID is null");
      }

      const { item_id, item_type, quantity } = req.body;
      console.log("Item details:", { item_id, item_type, quantity });

      const itemResult = await db.query(
          `SELECT * FROM stock_${item_type} WHERE item_id=$1`,
          [item_id]
      );
      if (itemResult.rows.length === 0) {
          console.log("Item not found:", { item_id, item_type });
          return res.status(404).send("Item not found");
      }

      const item = itemResult.rows[0];
      const availableItemQuantity = item.quantity;

      const itemCheckInCart = await db.query(
          "SELECT * FROM cart WHERE user_id=$1 AND item_id=$2",
          [userId, item_id]
      );

      if (itemCheckInCart.rows.length === 0) {
          const insertQuantity =
              quantity <= availableItemQuantity ? quantity : availableItemQuantity;
          await db.query(
              "INSERT INTO cart (user_id, img, name, description, item_id, price, quantity) VALUES ($1, $2, $3, $4, $5, $6, $7)",
              [
                  userId,
                  item.img,
                  item.name,
                  item.description,
                  item.item_id,
                  item.price,
                  insertQuantity,
              ]
          );
          console.log(
              "Item added to cart successfully with quantity:",
              insertQuantity
          );
      } else {
          const existingQuantity = itemCheckInCart.rows[0].quantity;
          const newQuantity = Math.min(
              existingQuantity + parseInt(quantity),
              availableItemQuantity
          );
          await db.query(
              "UPDATE cart SET quantity=$1 WHERE user_id=$2 AND item_id=$3",
              [newQuantity, userId, item_id]
          );
          console.log("Item quantity updated in cart to:", newQuantity);
      }

      res.status(200).json({ success: true, message: "Item added to cart successfully" });
  } catch (error) {
      console.error("Error in /AddToCart:", error);
      res.status(500).json({ success: false, message: "Internal Server Error" });
  }
});

// yaha pe Cart ka hai
app.get("/Cart", authenticateUser, async (req, res) => {
  try {
    // Fetch user details from the database
    const userResult = await db.query(`SELECT * FROM users WHERE email=$1`, [
      req.user.Email,
    ]);

    if (userResult.rows.length === 0) {
      console.log("User not found:", req.user.Email);
      return res.render("cart.ejs", {
        Addeditem: null,
      });
    }

    const user = userResult.rows[0];
    // console.log("User details:", user);

    // Extract user_id
    const userId = user.user_id;
    if (!userId) {
      console.log("User ID is null");
      return res.status(500).send("User ID is null");
    }
    if (req.user) {
      const firstName = req.user.fullName.split(" ")[0];
      const { rows: addedItemsOnCart } = await db.query(
        "SELECT * FROM cart WHERE user_id = $1",
        [userId]
      );
      res.render("Cart.ejs", {
        Login: firstName,
        Addeditem: addedItemsOnCart,
      });
      console.log("Successfully opened Cart with user log in");
    } else {
      res.render("Cart.ejs", {
        Login: null,
        Addeditem: [],
      });
      console.log("Successfully opened Cart without user logged in");
    }
  } catch (error) {
    console.error("Error opening Cart:", error);
    res.status(500).send("An error occurred, please try again.");
  }
});
// yaha pe item cart se remove karne ka hai.
// app.get("/removeItemFromCart", authenticateUser, async (req, res) => {
//   const user = req.user;
//   const firstName = req.user.fullName.split(" ")[0];
//   if (user === null) {
//     res.render("login.ejs");
//   }else{
//     res.render("cart.ejs",{
//       Login:firstName,
//       Addeditem: null,
//   });
//   }
// });
app.post("/removeItemFromCart", authenticateUser, async (req, res) => {
  let userId;
  const firstName = req.user.fullName.split(" ")[0];
  if (!req.user) {
    res.render("login.ejs");
    return res.status(401).send("User not authenticated");
  }

  try {
    const Userdetails = await db.query("SELECT * FROM users WHERE email=$1", [
      req.user.Email,
    ]);
    if (Userdetails.rows.length > 0) {
      userId = Userdetails.rows[0].user_id;
      console.log("User ID:", userId);
    } else {
      userId = null;
      console.log("Cannot get user_id");
    }
  } catch (error) {
    console.log("Cannot search for user", error);
    return res.status(500).json({ success: false, error: "Database error" });
  }

  if (!userId) {
    res.status(404).json({ success: false, error: "User not found" });
    return;
  }

  try {
    const { item_id, item_type } = req.body;
    console.log("Item ID:", item_id);
    console.log("Item Type:", item_type);

    try {
      const removingItemFromCart = await db.query(
        "DELETE FROM cart WHERE user_id=$1 AND item_id=$2",
        [userId, item_id]
      );
    
      if (removingItemFromCart.rowCount === 0) {
        console.log("No rows affected, item not found in cart");
        res.status(404).json({ success: false, error: "Item not found in cart" });
      } else {
        console.log("Item successfully deleted from cart and database");
        res.status(200).json({ success: true, message: "Item removed from cart" });
      }
    } catch (error) {
      console.log("Error removing item from cart", error);
      res.status(500).json({ success: false, error: "Database error" });
    }
    
  } catch (error) {
    console.log("Error getting item details", error);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

// yaha pe buy karne ka hai.
app.get("/Logout", (req, res) => {
  res.clearCookie("token");
  res.redirect("/");
});

// app.post('/Logout', (req, res) => {
//     res.clearCookie('token');
//     res.redirect("/");
// });

app.get("/achievements", async (req, res) => {
  try {
    const { rows: achievementData } = await db.query(
      "SELECT * FROM achievements ORDER BY id ASC"
    );
    if (achievementData.rows.length > 0) {
      res.render("achievements.ejs", {
        // Login: null,
        // admin: false,
        toastForNewsLetter:false,
        achievementData: achievementData,
      });
      console.log("Achievements data successfully retrived from database");
    }
  } catch (error) {
    console.log("Cannot send data and retrive from database for achievemenets");
    res.render("achievements.ejs", {
      // Login: null,
      // admin: false,
      toastForNewsLetter:false,
      achievementData: null,
    });
  }
});
app.use("/FAQ", authenticateUser, async (req, res) => {
  const firstName = req.user.fullName.split(" ")[0];
  try {
    const { rows: FAQ_data } = await db.query("SELECT * FROM faq");
    res.render("FAQ.ejs", { FAQ_data: FAQ_data, Login: firstName });
  } catch (error) {
    console.log("Unable to fetch FAQ's data");
  }
});
// yaha pe profile ka hai.
app.get("/Profile", authenticateUser, async (req, res) => {
  if (req.user) {
    const firstName = req.user.fullName.split(" ")[0];
    try {
      const { rows: user_data } = await db.query(
        "SELECT * FROM users WHERE email=$1",
        [req.user.Email]
      );
      const { rows: user_data_address } = await db.query(
        "SELECT * FROM users_address WHERE email=$1",
        [req.user.Email]
      );
      if (user_data.length > 0) {
        res.render("profile.ejs", {
          Login: firstName,
          user_data: user_data[0],
          user_data_address: user_data_address[0],
        });
      }
    } catch (error) {
      console.log("User does not exist", error);
    }

    console.log("Successfully opened profile with user log in");
  } else {
    res.render("login.ejs");
    console.log("Successfully opened login as user is not logged in");
  }
});
// yaha pe previous orders page ke liye hai.
app.get("/Orders",authenticateUser,(req,res)=>{
  if(req.user){
    const userEmail=req.user.Email;
  admin.userPreviousOrders(req,res,userEmail);
  }
})
app.get("/orderDetailsUser", authenticateUser, async (req, res) => {
  if (req.user) {
    const orderId = req.query.order_id;
    const userEmail = req.user.Email;

    // Fetch order details
    const orderData = await db.query("SELECT * FROM orders WHERE order_id=$1 AND email=$2", [orderId, userEmail]);
    const orderItems = orderData.rows;
    
    // Fetch details for each item in the order
    const itemDetails = [];
    for (const item of orderItems) {
      const details = await db.query(`SELECT * FROM stock_${item.item_type} WHERE item_id=$1`, [item.item_id]);
      itemDetails.push(details.rows[0]);
    }

    res.render("orderDetailsUser.ejs", {
      order: orderItems,
      itemDetails: itemDetails
    });
  }
});

// for password change.
app.get("/Password_change", authenticateUser, (req, res) => {
  try {
    if (req.user) {
      res.render("changePassword.ejs");
      console.log("changePassword page sucessfully rendered");
    } else {
      res.render("login.ejs");
      console.log("User not logged in and trying to change password");
    }
  } catch (error) {}
});
app.post("/Change_password", authenticateUser, async (req, res) => {
  try {
    if (req.user) {
      const { current_password, new_password, confirm_password } = req.body;

      const email = req.user.Email;
      const searchingUser = await db.query(
        "SELECT * FROM users WHERE email=$1",
        [email]
      );
      const user_found = searchingUser.rows[0];
      if (searchingUser.rows.length > 0) {
        console.log("User found in the database for changing password");
        const PassCheck = await bcrypt.compare(
          current_password,
          user_found.password_entered
        );
        if (PassCheck) {
          console.log(
            "existing password is same as password stored in the database"
          );
          if (new_password === confirm_password) {
            const saltRounds = 10;
            const salt = await bcrypt.genSalt(saltRounds);
            const hashedPassword = await bcrypt.hash(confirm_password, salt);
            console.log("new password matches confirm password block");
            await db.query(
              "UPDATE users SET password_entered=$1 WHERE email=$2",
              [hashedPassword,email]
            );
            res.render("login.ejs");

            res.render("changePassword.ejs", {
              error: "New passwords do not match.",
            });
          }
        } else {
          res.render("changePassword.ejs", {
            error: "Current password is incorrect.",
          });
        }
      } else {
        res.render("changePassword.ejs", { error: "User not found." });
      }
    } else {
      res.render("login.ejs");
    }
  } catch (error) {
    console.error("Error processing password change:", error);
    res.status(500).send("Internal Server Error");
  }
});

// For Mobile Number
app.post("/EnterMobileNumber", authenticateUser, async (req, res) => {
  const { mobile_number } = req.body;
  if (req.user) {
    try {
      const addMobileNumber = await db.query(
        "SELECT * FROM users WHERE email=$1",
        [req.user.Email]
      );
      if (addMobileNumber.rows.length > 0) {
        await db.query("UPDATE users SET mobile_number=$1 WHERE email=$2", [
          mobile_number,
          req.user.Email,
        ]);
        console.log("Mobile number successfully updated in the database");
        res.redirect("/Profile");
      }
    } catch (error) {
      console.log("Error updating mobile number:", error);
      res.status(500).send("Internal server error");
    }
  }
});

// For Address
app.post("/EnterAddress", authenticateUser, async (req, res) => {
  const { address } = req.body;
  if (req.user) {
    try {
      const addAddress = await db.query(
        "SELECT * FROM users_address WHERE email=$1",
        [req.user.Email]
      );
      if (addAddress.rows.length > 0) {
        await db.query("UPDATE users_address SET address=$1 WHERE email=$2", [
          address,
          req.user.Email,
        ]);
        console.log("Address successfully updated in the database");
        res.redirect("/Profile");
      }
    } catch (error) {
      console.log("Error updating address:", error);
      res.status(500).send("Internal server error");
    }
  }
});

// For City
app.post("/EnterCity", authenticateUser, async (req, res) => {
  const { city } = req.body;
  if (req.user) {
    try {
      const addAddress = await db.query(
        "SELECT * FROM users_address WHERE email=$1",
        [req.user.Email]
      );
      if (addAddress.rows.length > 0) {
        await db.query("UPDATE users_address SET city=$1 WHERE email=$2", [
          city,
          req.user.Email,
        ]);
        console.log("City successfully updated in the database");
        res.redirect("/Profile");
      }
    } catch (error) {
      console.log("Error updating city:", error);
      res.status(500).send("Internal server error");
    }
  }
});

// For State
app.post("/EnterState", authenticateUser, async (req, res) => {
  const { state } = req.body;
  if (req.user) {
    try {
      const addAddress = await db.query(
        "SELECT * FROM users_address WHERE email=$1",
        [req.user.Email]
      );
      if (addAddress.rows.length > 0) {
        await db.query("UPDATE users_address SET state=$1 WHERE email=$2", [
          state,
          req.user.Email,
        ]);
        console.log("State successfully updated in the database");
        res.redirect("/Profile");
      }
    } catch (error) {
      console.log("Error updating state:", error);
      res.status(500).send("Internal server error");
    }
  }
});

// For Zip Code
app.post("/EnterZip", authenticateUser, async (req, res) => {
  const { zip_code } = req.body;

  if (req.user) {
    // Validate the zip code using Postalpincode.in API
    const isValid = await validateIndianZipCode(zip_code);
    if (!isValid) {
      console.log("Invalid zip code");
      return res.status(400).send("Invalid zip code");
    }

    try {
      const addAddress = await db.query(
        "SELECT * FROM users_address WHERE email=$1",
        [req.user.Email]
      );
      if (addAddress.rows.length > 0) {
        await db.query("UPDATE users_address SET zip_code=$1 WHERE email=$2", [
          zip_code,
          req.user.Email,
        ]);
        console.log("Zip code successfully updated in the database");
        res.redirect("/Profile");
      } else {
        console.log("User not found in user_address database");
        res.status(404).send("User not registered");
      }
    } catch (error) {
      console.log("Error updating zip code:", error);
      res.status(500).send("Internal server error");
    }
  }
});

// yaha pe news letter jo subscribe kiya hai uska hai.
app.post("/subscribedToNewsLetter", authenticateUser, async (req, res) => {
  if (req.user) {
    try {
      const Email = req.body;
      if (Email) {
        const checkDuplicateEmail_forNewsLetter = await db.query(
          "SELECT * FROM news_letter_subscriber WHERE email=$1",
          [Email]
        );
        if (checkDuplicateEmail_forNewsLetter) {
          res.render("/");
          res.send("Email already exist");
          console("Email already exist");
        } else {
          await db.query(
            "INSERT INTO news_letter_subscriber(email) VALUES($1)",
            [Email]
          );
          res.redirect("/");
          console.log("Email successfully added for news letter");
         }
      }
    } catch (error) {
      res.redirect("/");
      console.log("Failed to get email subscribe news letter route", error);
    }
  } else {
    res.redirect("/newLogin");
    console.log(
      "User not logged in and trying to subscribe to newsLetter that is why redirected to login page"
    );
  }
});
app.get("/adminDashboard",authenticateUser,(req,res)=>{
  const firstName = req.user.fullName.split(" ")[0];
  admin.adminRole(req,res,firstName);
})
// yaha pe news letter create karne aka hai for admin.
app.get("/Create_newsLetter", authenticateUser, async (req,res) => {
admin.createNewsLetterAdmin(req,res);
});
// yaha pe news letter bhejne ka hai for admin.
// Route for sending newsletters
app.post("/NewsLetter_Sending", async (req, res) => {
  const userDetails = await db.query("SELECT * FROM users WHERE email=$1", [req.user.Email]);
  const userCheck = userDetails.rows[0];
  const firstName = userCheck.full_name.split(" ")[0];
  const { Title, Description } = req.body;

  try {
    await admin.adminSendingNewsLetter(req, res, Title, Description, firstName);
    res.redirect('/adminDashboard?success=true'); // Redirect with success parameter
  } catch (error) {
    console.error("Failed to send newsletter:", error);
    res.redirect('/adminDashboard?success=false'); // Redirect with failure parameter
  }
});

app.get("/updateAchievements",authenticateUser,(req,res)=>{
  if(req.user){
    res.render("Update_Achievements.ejs");
    console.log("Update achievements page opened");
  }else{
    res.redirect("/newLogin");
    console.log("Update achievements page not opened user not logged in");
  }
})
// yaha pe images user se lena ka hai middleware.
const storage = multer.diskStorage({
  destination: path.join(_dirname, 'public/images'), // Store files in public/images
  filename: function (req, file, cb) {
    const timestamp = Date.now();
    const fileExt = path.extname(file.originalname);
    const filename = `${timestamp}-${file.originalname}`;
    cb(null, filename);
  }
});
const upload = multer({ storage: storage });

// Define your route with multer middleware
app.post('/AddAchievements', authenticateUser, upload.single('imageTaken'), async(req, res) => {
  // Extract other form fields from req.body
  const { placeName, medalsWon, description } = req.body;
  // Extract file information from req.file
  const imageTaken = req.file; // This will contain file details
  // Ensure req.user is defined
  if (req.user) {
    // Call the addAchievements function with the file and other form fields
    const imagePath = `/images/${imageTaken.filename}`;
    const addedAchievements=admin.addAchievements(req, res, imagePath, placeName, description, medalsWon);
    if(addedAchievements){
      try {
        const { rows: achievementData } = await db.query(
          "SELECT * FROM achievements ORDER BY id ASC"
        );
        if (achievementData.rows.length > 0) {
          res.render("achievements.ejs", {
            // Login: firstName,
            // admin: false,
            achievementData: achievementData,
            toastForNewsLetter:true,
          });
          console.log("Achievements data successfully retrived from database");
        }
      } catch (error) {
        console.log("Cannot send data and retrive from database for achievemenets");
      }
    }
    
  } else {
    res.status(401).send('Unauthorized');
  }
});

app.get("/downloadOnlineUserData",async(req,res)=>{
  const data = await db.query("SELECT * FROM users");
  const users = data.rows;
    console.log(users);
  admin.downloadOnlineUsersList(req,res,users);
})
app.get("/downloadofflineUserData",async(req,res)=>{
  const data = await db.query("SELECT * FROM offline_customer");
  const users = data.rows;
    console.log(users);
  admin.downloadOfflineUsersList(req,res,users);
})
app.get("/downloadavailableStock",async(req,res)=>{
  const dataSkate = await db.query("SELECT * FROM stock_skates");
  const dataHelmets = await db.query("SELECT * FROM stock_helmets");
  const dataWheels = await db.query("SELECT * FROM stock_wheels");
  const dataSkinSuits = await db.query("SELECT * FROM stock_skinsuits");
  const dataAccessories = await db.query("SELECT * FROM stock_accessories");
  const availableStockSkate= dataSkate.rows;
  const availableStockHelmets= dataHelmets.rows;
  const availableStockWheels= dataWheels.rows;
  const availableStockSkinSuits= dataSkinSuits.rows;
  const availableStockAccessories= dataAccessories.rows;
  const totalStock = availableStockSkate.concat(availableStockHelmets, availableStockWheels, availableStockSkinSuits, availableStockAccessories);
  // console.log(totalStock);
  admin.downloadavailableStock(req,res,totalStock);
})
app.get("/downloadOnlineSaleList", async (req, res) => {
  try {
    const data = await db.query("SELECT * FROM orders WHERE status=$1 ORDER BY created_at DESC", ['Delivered']);
    const ordersOnline = data.rows;
    console.log(ordersOnline);
    admin.downloadOnlineSaleList(req, res, ordersOnline);
  } catch (error) {
    console.error("Error fetching online sale list:", error);
    res.status(500).send("Error fetching online sale list");
  }
});
app.get("/registerNewStudent",authenticateUser,async (req,res)=>{
if(req.user){
  res.render("NewStudentRegistration.ejs");
}
});
app.post("/addStudent", authenticateUser, async (req, res) => {
  const { Student_Name, Father_name, Mother_name, mobile_number, email, groupAddedOn, skate_type, feePaid } = req.body;

  try {
      // Call the newStudent method and wait for it to complete
      const data = await admin.newStudent(req, res, Student_Name, Father_name, Mother_name, mobile_number, email, groupAddedOn, skate_type, feePaid);

      // Check if data is valid (assuming data should not be null or undefined)
      if (data===true) {
          // Render the view with a success message
          res.render("NewStudentRegistration.ejs", { toastMessage: "Student successfully added!" });
      }else if(data==='e'){
          // Render the view with an error message
          res.render("NewStudentRegistration.ejs", { toastMessage: "Failed to add student, Student already exists. Please try again." });
        }else{
        res.render("NewStudentRegistration.ejs", { toastMessage: "Failed to add student , Please try again." });
      }
  } catch (error) {
      // Handle any errors that occurred during the process
      console.error("Error adding student:", error);
      res.render("NewStudentRegistration.ejs", { toastMessage: "An error occurred. Please try again later." });
  }
});

app.get("/downloadOfflineSaleList", async (req, res) => {
  try {
    const data = await db.query("SELECT * FROM orders_offline ORDER BY created_at DESC");
    const ordersOffline = data.rows;
    console.log(ordersOffline);
    admin.downloadOfflineSaleList(req, res, ordersOffline);
  } catch (error) {
    console.error("Error fetching online sale list:", error);
    res.status(500).send("Error fetching online sale list");
  }
});
app.get("/editHomePage",authenticateUser,(req,res)=>{
  if(req.user){
    res.render("edit_Home.ejs");
  }
});
// yaha pe shop ke edit karne ka hai.
app.get("/editShop",authenticateUser,async(req,res)=>{
  try {
  const firstName = req.user.fullName.split(" ")[0];
    const dataSkate = await db.query("SELECT * FROM stock_skates");
    const dataHelmets = await db.query("SELECT * FROM stock_helmets");
    const dataWheels = await db.query("SELECT * FROM stock_wheels");
    const dataSkinSuits = await db.query("SELECT * FROM stock_skinsuits");
    const dataAccessories = await db.query("SELECT * FROM stock_accessories");
    const availableStockSkate= dataSkate.rows;
    const availableStockHelmets= dataHelmets.rows;
    const availableStockWheels= dataWheels.rows;
    const availableStockSkinSuits= dataSkinSuits.rows;
    const availableStockAccessories= dataAccessories.rows;
    const totalStock = availableStockSkate.concat(availableStockHelmets, availableStockWheels, availableStockSkinSuits, availableStockAccessories);
    res.render("editShop.ejs",{
      items_data:totalStock,
      Login:firstName,
      toastForNewsLetter:false,
    })
  } catch (error) { 
    console.log("Cannot get items data for Edit shop page");
  }
})
app.get("/updateItemForShop", authenticateUser, async (req, res) => {
  try {
      const { item_id, item_type } = req.query; // Assuming item_id and item_type are passed as query parameters
      // console.log(item_id,item_type);
      const data = await db.query(`SELECT * FROM stock_${item_type} WHERE item_id=$1`, [item_id]);
      const result = data.rows[0];
      if (!result) {
          return res.status(404).send("Item not found");
      }
      res.render("updateItem.ejs", { item_data: result });
  } catch (error) {
      console.error("Error fetching item for update:", error);
      res.status(500).send("An error occurred while fetching the item.");
  }
});
app.post("/deleteItemFromShop", authenticateUser, async (req, res) => {
  try {
    if (req.user) {
      const { item_id, item_type } = req.body;

      // Corrected SQL query typo from FORM to FROM
      const data = await db.query(`SELECT * FROM stock_${item_type} WHERE item_id=$1`, [item_id]);
      const result = data.rows[0];

      if (result) {
        await db.query(`DELETE FROM stock_${item_type} WHERE item_id=$1`, [item_id]);
        console.log("Item deleted successfully");
        
        await db.query(`DELETE FROM product_details WHERE item_id=$1`, [item_id]);
        res.redirect("/editShop");
      } else {
        console.log("Item does not exist for deletion");
        res.status(404).send("Item not found");
      }
    } else {
      res.status(403).send("Unauthorized access");
    }
  } catch (error) {
    console.error("Error deleting item:", error);
    res.status(500).send("Internal server error");
  }
});

app.post("/updateItemForShop", authenticateUser, async (req, res) => {
  try {
    if (req.user) {
      const { item_id, item_type } = req.body;

      const data = await db.query(`SELECT * FROM stock_${item_type} WHERE item_id=$1`, [item_id]);
      const result = data.rows[0];

      if (!result) {
        return res.status(404).json({ success: false, message: "Item not found" });
      }

      res.json({ success: true, item_data: result });
    } else {
      res.status(401).json({ success: false, message: "Unauthorized" });
    }
  } catch (error) {
    console.error("Error occurred:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});
app.get("/addNewItem",authenticateUser,(req,res)=>{
if(req.user){
  res.render("add_itemPage.ejs");
  console.log("Add item page rendered successfully");
}else{
  res.redirect("/newLogin");
  console.log("Add item page cannot be rendered admin not logged in");
}
})
app.post("/completeAddingNewItem",authenticateUser,upload.single('itemsImage'),upload.single('itemsImage1'),upload.single('itemsImage2'),(req,res)=>{
  try {
    const {itemsName,itemsDescription,itemsItemId,itemsPrice,itemsQuantity,itemsItemType}=req.body;
    const imageTaken = req.file;
    const imageTaken1 = req.file;
    const imageTaken2 = req.file;
    const imagePath = `/images/${imageTaken.filename}`;
    const imagePath1 = `/images/${imageTaken1.filename}`;
    const imagePath2 = `/images/${imageTaken2.filename}`;
    const itemAddedSuccessfully=admin.addingNewItemInShop(imagePath,imagePath1,imagePath2,itemsName,itemsDescription,itemsItemId,itemsPrice,itemsQuantity,itemsItemType)
    if(itemAddedSuccessfully){
      res.redirect("/editShop");  
    }
  } catch (error) {
    console.log("Cannot retrieve item details",error);
  }
})
app.post("/completeUpdationOfItem", authenticateUser, async (req, res) => {
  try {
    const { item_id, item_type, Change_itemName, ChangeItemDescription, addQuantity, ChangeItemPrice } = req.body;

    if (req.user) {
      console.log("Form data received:", req.body); // Logging the form data
      const firstName = req.user.fullName.split(" ")[0];
      try {
        const data = await db.query(`SELECT * FROM stock_${item_type} WHERE item_id=$1`, [item_id]);
        const currentItem = data.rows[0];

        if (!currentItem) {
          throw new Error("Item not found");
        }

        const newName = Change_itemName && Change_itemName !== currentItem.name ? Change_itemName : currentItem.name;
        const newDescription = ChangeItemDescription && ChangeItemDescription !== currentItem.description ? ChangeItemDescription : currentItem.description;
        const newPrice = ChangeItemPrice && ChangeItemPrice !== currentItem.price ? ChangeItemPrice : currentItem.price;
        const newAddedQuantity = addQuantity ? currentItem.quantity + parseInt(addQuantity, 10) : currentItem.quantity;

        await db.query(`UPDATE stock_${item_type} SET name=$1, description=$2, quantity=$3, price=$4 WHERE item_id=$5`, [
          newName,
          newDescription,
          newAddedQuantity,
          newPrice,
          item_id,
        ]);

        console.log("Update successful"); // Logging success

        const dataSkate = await db.query("SELECT * FROM stock_skates");
        const dataHelmets = await db.query("SELECT * FROM stock_helmets");
        const dataWheels = await db.query("SELECT * FROM stock_wheels");
        const dataSkinSuits = await db.query("SELECT * FROM stock_skinsuits");
        const dataAccessories = await db.query("SELECT * FROM stock_accessories");

        const availableStockSkate = dataSkate.rows;
        const availableStockHelmets = dataHelmets.rows;
        const availableStockWheels = dataWheels.rows;
        const availableStockSkinSuits = dataSkinSuits.rows;
        const availableStockAccessories = dataAccessories.rows;

        const totalStock = availableStockSkate.concat(
          availableStockHelmets,
          availableStockWheels,
          availableStockSkinSuits,
          availableStockAccessories
        );

        res.render("editShop.ejs", {
          Login:firstName,
          items_data: totalStock,
          toastForNewsLetter: true,
        });
      } catch (error) {
        console.error("Error in completeItemUpdation:", error);
        res.status(500).send("An error occurred while updating the item.");
      }
    } else {
      res.redirect("/newLogin");
    }
  } catch (error) {
    console.error("Error updating item:", error);
    res.status(500).send("An error occurred while updating the item.");
  }
});

app.get("/ordersStatus",authenticateUser,async(req,res)=>{
  const data =await db.query("SELECT * FROM orders");
  const result=data.rows;
  if(req.user){
    res.render("orders_status.ejs",{
      Order_data:result,
    });
  }else{
    res.render("login.ejs");
  }
})
app.post("/orderDetails",authenticateUser,async(req,res)=>{
  const {getOrderDetails}=req.body;
  if(req.user){
    const data=await db.query("SELECT * FROM orders WHERE order_id=$1",[getOrderDetails]);
    const result=data.rows[0];
    if(result){
    res.render("orderDetails.ejs",{
      order_data:result,
      toastForNewsLetter: false,
    });
  }else{
    res.render("orderDetails.ejs",{
      order_data:null,
      toastForNewsLetter: false,
    });
  }
  }
})
app.post("/changeStatus",authenticateUser,(req,res)=>{
  const newStatus=req.body.orderStatusChange;
  const orderId = req.body.orderId;
  if(req.user){
  admin.changeOrderStatus(req,res,newStatus,orderId);
  console.log("User is verified hence calling change status function");
  }else{
    res.render("login.ejs");
  }
})
app.post("/downloadOrderDetails",authenticateUser,async(req,res)=>{
  try {
    if(req.user){
      const orderId = req.body.orderId;
      const data=await db.query("SELECT * FROM orders WHERE order_id=$1",[orderId])
      const order_data=data.rows[0];
      if(order_data){
    admin.getOrderDetails(req,res,order_data);
      }
  else{
console.log("Could not get order it does not exist ");
  }
    }else{
      res.render("login.js");
    }
  } catch (error) {
    console.log("could not download oreder details",error);
  }
})
app.post("/editAchievementsText", authenticateUser, async (req, res) => {
  try {
    const userDetails = await db.query("SELECT * FROM users WHERE email = $1", [req.user.Email]);
    const userCheck = userDetails.rows[0];
    const firstName = userCheck.full_name.split(" ")[0];
    const { editTextForAchievements } = req.body;

    if (req.user) {
      await admin.editAchievementsText(req, res, editTextForAchievements, firstName);
    } else {
      res.redirect("/login"); // Redirect to login if user is not authenticated
    }
  } catch (error) {
    console.log("Error fetching user details", error);
    res.status(500).send("Internal Server Error");
  }
});
app.post("/editMeetOurCoachText", authenticateUser, async (req, res) => {
  try {
    const userDetails = await db.query("SELECT * FROM users WHERE email = $1", [req.user.Email]);
    const userCheck = userDetails.rows[0];
    const firstName = userCheck.full_name.split(" ")[0];
    const { editTextForMeetOurCoach } = req.body;

    if (req.user) {
      await admin.editMeetOurCoachText(req, res, editTextForMeetOurCoach, firstName);
    } else {
      res.redirect("/login"); // Redirect to login if user is not authenticated
    }
  } catch (error) {
    console.log("Error fetching user details", error);
    res.status(500).send("Internal Server Error");
  }
});
// yaha pe invoice ka hai.
app.get("/createInvoice",authenticateUser,async(req,res)=>{
  try {
    const itemsData=["skates","helmets","wheels","skinsuits","accessories"];
    const allItemsData={};
    if(req.user){
    for(var i=0 ; i<itemsData.length ; i++){
      const result = await db.query(`SELECT * FROM stock_${itemsData[i]} WHERE quantity >= 1`);
allItemsData[itemsData[i]] = result.rows;//yaha pe key value pair ban raha hai where items name is the key and result.rows is values to those key
    }
    res.render("generate_invoice.ejs", {
      item_data: allItemsData
    });
      console.log("generate invoice page opened sucessfully");
    }
  } catch (error) {
    res.render("login.ejs");
    console.log("cannot open invoice page",error);
  }
})
app.post("/generateInvoice",authenticateUser,async(req,res)=>{
  try {
    const {customer_name,customer_email,customer_number}=req.body;
    const {items}=req.body;//here items is like the array of objects
    // console.log(items);   
    if(req.user){
      const offlineCustomerCheck=await db.query("SELECT * FROM offline_customer WHERE email=$1 AND mobile_number=$2",[customer_email,customer_number]);
      if(offlineCustomerCheck.rows.length===0){
      await db.query("INSERT INTO offline_customer (full_name,email,mobile_number) VALUES($1,$2,$3)",[customer_name,customer_email,customer_number]);
      console.log("Successfully added offline customer details in the database");
      const customer_details=await db.query("SELECT * FROM offline_customer WHERE email=$1 OR mobile_number=$2",[customer_email,customer_number]);
      const customer_data=customer_details.rows[0];
      admin.invoiceGeneration(req,res,customer_data,items);
    }else{
      const customer_details=await db.query("SELECT * FROM offline_customer WHERE email=$1 OR mobile_number=$2",[customer_email,customer_number]);
      // console.log("Offline Customer already exist");
      const customer_data=customer_details.rows[0];
      admin.invoiceGeneration(req,res,customer_data,items);
      }
    }else{
      res.render("login.ejs");
    }
  } catch (error) {
    console.log("cannot get offline customer details",error);
  }
})
app.post("/generateBill",authenticateUser,async(req,res)=>{
  try {
    const {customer_name,customer_email,customer_number}=req.body;
    const {items}=req.body;//here items is like the array of objects
    // console.log(items);   
    if(req.user){
      const offlineCustomerCheck=await db.query("SELECT * FROM offline_customer WHERE email=$1 AND mobile_number=$2",[customer_email,customer_number]);
      if(offlineCustomerCheck.rows.length===0){
      await db.query("INSERT INTO offline_customer (full_name,email,mobile_number) VALUES($1,$2,$3)",[customer_name,customer_email,customer_number]);
      console.log("Successfully added offline customer details in the database");
      const customer_details=await db.query("SELECT * FROM offline_customer WHERE email=$1 OR mobile_number=$2",[customer_email,customer_number]);
      const customer_data=customer_details.rows[0];
      const billGenerationComplete=admin.billGeneration(req, res, customer_data, items);
      if(billGenerationComplete){
        for (const item of items) {
          await db.query("INSERT INTO orders_offline (email, name, mobile_number, item_name, item_id, item_type, amount, quantity) VALUES($1,$2,$3,$4,$5,$6,$7,$8)", 
          [customer_email, customer_name, customer_number, item.item_name, item.item_id, item.item_type, item.price, '1']);
          await db.query(
            `UPDATE stock_${item.item_type} SET quantity = quantity - $1 WHERE item_id = $2`,
            [1, item.item_id]
          );
        }     
        console.log("quantity updated through offline purchase");
      console.log("offline purchase complete adding details to database");
      }
    }else{
      const customer_details=await db.query("SELECT * FROM offline_customer WHERE email=$1 OR mobile_number=$2",[customer_email,customer_number]);
      // console.log("Offline Customer already exist");
      const customer_data=customer_details.rows[0];
      admin.billGeneration(req, res, customer_data, items)
      const billGenerationComplete=admin.billGeneration(req, res, customer_data, items);
      if(billGenerationComplete){
        for (const item of items) {
          await db.query("INSERT INTO orders_offline (email, name, mobile_number, item_name, item_id, item_type, amount, quantity) VALUES($1,$2,$3,$4,$5,$6,$7,$8)", 
          [customer_email, customer_name, customer_number, item.item_name, item.item_id, item.item_type, item.price, '1']);
          await db.query(
            `UPDATE stock_${item.item_type} SET quantity = quantity - $1 WHERE item_id = $2`,
            [1, item.item_id]
          );
      }
    }
      }
    }else{
      res.render("login.ejs");
    }
  } catch (error) {
    console.log("cannot get offline customer details",error);
  }
})
db.connect();
app.listen(port, () => {
  console.log(`Listening on port:${port}`);
});
// function for zip validation the api used is zipcodeApi.
async function validateIndianZipCode(postalCode) {
  const apiKey = process.env.pinCodeApiKey; // Replace with your actual API key
  try {
    const response = await axios.get(
      `https://www.zipcodeapi.com/rest/${apiKey}/info.json/${postalCode}/degrees`
    );
    return response.data;
  } catch (error) {
    console.error("Error validating postal code:", error);
    return false;
  }
}
