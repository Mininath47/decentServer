const express = require("express");
const cors = require("cors");
const mongodb = require('mongodb').MongoClient;
const mysql = require("mysql");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const nodemailer = require("nodemailer");
const crypto = require("crypto");
require("dotenv").config();

const app = express();
const conString = process.env.MongoUrl;
const Port = process.env.PORT || 4000;

app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());



app.use("/uploads", express.static(path.join(__dirname, "uploads"))); // Serve uploaded images

// ✅ Database Connection Pool (Prevents Timeout Issues)
const db = mysql.createConnection({
    host: process.env.HOST,
    user: process.env.USER,
    password: process.env.PASSWORD,
    database: process.env.DATABASES,
    port: process.env.PORTT || 3306,
    connectTimeout: 1000, // Allow multiple connections
});



//-------------------------------------------- MongoDB Routes  --------------------------------------


app.post('/user-register', (req, res) => {
    bcrypt.hash(req.body.password, 10, (err, hashedPassword) => {
        if (err) {
            return res.status(500).send({ error: "Error hashing password", details: err });
        }

        const user = {
            userid: req.body.userid,
            mobile: req.body.mobile,
            age: req.body.age,
            email: req.body.email,
            password: hashedPassword, // Store hashed password
        };

        mongodb.connect(conString)
            .then((object) => {
                const database = object.db('decent');
                database.collection('UserLogin').insertOne(user)
                    .then(() => res.send({ message: "User registered successfully" }))
                    .catch(err => res.status(500).send({ error: "Database error", details: err }));
            })
            .catch(err => res.status(500).send({ error: "Database connection failed", details: err }));
    });
});

const client = new mongodb(conString);

app.post('/login', async (req, res) => {
    try {
        await client.connect();
        const database = client.db('decent');
        const usersCollection = database.collection('UserLogin');

        const { userid, password } = req.body;
        if (!userid || !password) {
            return res.status(400).json({ error: 'User ID and password are required' });
        }

        const user = await usersCollection.findOne({ userid });
        if (!user) {
            return res.status(400).json({ error: 'User not found' });
        }

        res.json({ message: 'Login successful' });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    } finally {
        await client.close();
    }
});

app.get('/login/:userid', (req, res) => {
    const userID = req.params.userid;
    mongodb.connect(conString).then((object) => {
        const database = object.db('decent');
        database.collection('UserLogin').find({userid:userID}).toArray().then((document) => {
            res.send(document);
            res.end();
        });
    }); 
});

app.get('/cart', (req, res) => {
    const userId = req.query.user_id; // Assuming user_id is sent as a query param

    if (!userId) {
        return res.status(400).send({ error: "User ID is required" });
    }

    mongodb.connect(conString).then((object) => {
        const database = object.db('decent');
        database.collection('cart').find({ userid: userId }).toArray()
            .then((document) => {
                // Calculate the total price for this user
                let totalPrice = document.reduce((sum, item) => sum + (item.price * (item.quantity || 1)), 0);

                res.send({ cartItems: document, totalPrice: totalPrice });
            })
            .catch(err => {
                res.status(500).send({ error: "Failed to fetch cart items", details: err });
            });
    }).catch(err => {
        res.status(500).send({ error: "Database connection failed", details: err });
    });
});


app.get('/cart/:userid', (req, res) => {
    const userID = req.params.userid;
    mongodb.connect(conString).then((object) => {
        const database = object.db('decent');
        database.collection('cart').find({userid:userID}).toArray().then((document) => {
            res.send(document);
            res.end();
        });
    }); 
});


// ✅ Add Product to Cart API
app.post("/cart", (req, res) => {
    const cartItem = {
        userid: req.body.userid,
        product_id: req.body.product_id,
        descri:req.body.descri,
        title: req.body.title,
        price: req.body.price,
        img: req.body.img,
        que: req.body.que || 1, // Default quantity to 1
    };
    mongodb.connect(conString).then((object) => {
        

        const database = object.db("decent");
        database.collection("cart").insertOne(cartItem).then((document) => {
            res.send(document);
            res.end();
        }).catch((error) => {
            res.status(500).json({ error: error.message });
        });
    }).catch((error) => {
        res.status(500).json({ error: "Database connection failed", details: error.message });
    });
});

app.put('/cart/:product_id', (req, res) => {
    const ProductID = parseInt(req.params.product_id);
    mongodb.connect(conString).then((object) => {
        const database = object.db('decent');
        database.collection('cart').updateOne({ product_id: ProductID },{ $set: { product_id: ProductID, que: req.body.que } }).then((document) => {
            res.send('update One Product....');
            res.end();
        });
    });
});
app.put('/cart/:qnty', (req, res) => {
    const Que = parseInt(req.params.qnty);

    mongodb.connect(conString).then((object) => {
        const database = object.db('decent');
        const cartCollection = database.collection('cart');

        cartCollection.updateOne(
            { que: Que },
            { $inc: { qnty: 1 } } // Increase quantity by 1
        ).then((document) => {
            if (document.matchedCount > 0) {
                res.send('Quantity increased by 1.');
            } else {
                res.status(404).send('Item not found.');
            }
            res.end();
        }).catch((error) => {
            res.status(500).send('Database error.');
            res.end();
        });
    }).catch((error) => {
        res.status(500).send('Connection error.');
        res.end();
    });
});


app.delete('/cart/:qnty', (req, res) => {
    const Qnt = parseInt(req.params.qnty);

    mongodb.connect(conString).then((object) => {
        const database = object.db('decent');
        const cartCollection = database.collection('cart');

        cartCollection.findOne({ que: Qnt }).then((item) => {
            if (item) {
                if (item.qnty > 1) {
                    // Reduce quantity by 1
                    cartCollection.updateOne(
                        { que: Qnt },
                        { $inc: { qnty: -1 } }
                    ).then(() => {
                        res.send('Quantity reduced by 1.');
                        res.end();
                    });
                } else {
                    // Remove item if quantity reaches 0
                    cartCollection.deleteOne({ que: Qnt }).then(() => {
                        res.send('Item removed as quantity reached 0.');
                        res.end();
                    });
                }
            } else {
                res.status(404).send('Item not found.');
                res.end();
            }
        });
    }).catch((error) => {
        res.status(500).send('Database error.');
        res.end();
    });
});

// ------------------------------------- Cart Product Delete ----------------------

app.delete('/cart/:product_id', (req, res) => {
    const ProductID = parseInt(req.params.product_id);
    mongodb.connect(conString).then((object) => {
        const database = object.db('decent');
        database.collection('cart').deleteOne({product_id:ProductID}).then((document) => {
            res.send('Delete product One....');
            res.end();
        });
    });
});
//----------------------- Delete All one User All Products  -------------------------


app.delete('/cart-user/:userid', (req, res) => {
    const UserID =req.params.userid;
    mongodb.connect(conString).then((object) => {
        const database = object.db('decent');
        database.collection('cart').deleteMany({ userid:UserID}).then((document) => {
            res.send('Delete this user  product All....');
            res.end();
        });
    });
});


//--------------------------------------  reset Password  --------------------------------------------


// Configure Email Transporter
 const transporter = nodemailer.createTransport({
        host: process.env.Email_Host ,
        port: process.env.Email_Port ,
        secure: true,
        auth: {
            user: process.env.Send_Email,
            pass: process.env.Email_Pass, // Replace with your App Password
        },
    });

// Store OTPs temporarily (Ideally, store in DB)
const otpStore = {};



// ✅ 1. Send OTP to User's Email
app.post("/send-otp", (req, res) => {
    const { email } = req.body;
    const otp = Math.floor(100000 + Math.random() * 900000).toString(); // Generate 6-digit OTP
    otpStore[email] = otp; // Save OTP temporarily

    // Send OTP via Email
    transporter.sendMail({
        from: process.env.Send_Email,
        to: email,
        subject: "Password Reset OTP",
        text: `Your OTP is: ${otp}`,
    }, (err, info) => {
        if (err) return res.status(500).send({ error: "Failed to send OTP", details: err });
        res.send({ message: "OTP sent successfully" });
    });
});

// ✅ 2. Verify OTP
app.post("/verify-otp", (req, res) => {
    const { email, otp } = req.body;
    if (otpStore[email] && otpStore[email] === otp) {
        res.send({ message: "OTP Verified" });
    } else {
        res.status(400).send({ error: "Invalid OTP" });
    }
});

// ✅ 3. Reset Password
app.post("/reset-password", (req, res) => {
    const { email, newPassword } = req.body;

    bcrypt.hash(newPassword, 10, (err, hashedPassword) => {
        if (err) return res.status(500).send({ error: "Error hashing password", details: err });

        mongodb.connect(conString).then((object) => {
            const database = object.db("decent");
            database.collection("UserLogin").updateOne({ email: email }, { $set: { password: hashedPassword } })
                .then(() => res.send({ message: "Password updated successfully" }))
                .catch(err => res.status(500).send({ error: "Database update failed", details: err }));
        }).catch(err => res.status(500).send({ error: "Database connection failed", details: err }));
    });
});


//------------------------------------- Request admin panel  ------------------------------------------

app.get('requiest-adminPanel', (req, res) => {
    mongodb.connect(conString).then((object) => {
        const database = object.db('decent');
        database.collection('AdminReq').insertOne().then((document) => {
            res.send(document);
            res.end();
        });
    });
});

app.post('requiest-adminPanel', (req, res) => {
    const user = {
        email: req.body.email,
        rol: req.body.rol
    }
    mongodb.connect(conString).then((object) => {
        const database = object.db('decent');
        database.collection('AdminReq').insertOne(user).then(() => {
            res.send('One Requiest Admin...');
            res.end();
        });
    });
});

//--------------------------------------- MongoDB End  ---------------------------------------------------//




// ✅ Check Database Connection
// db. ((err, connection) => {
//     if (err) {
//         console.error("Database connection failed: ", err);
//     } else {
//         console.log("Connected to MySQL Database");
//         connection.release();
//     }
// });

db.connect((err) => {
    if (err) throw err;
    else {
        console.log('MysqlDb Connected...');
    }
});


// ✅ Multer Storage Configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, "uploads/");
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + "-" + file.originalname); // Unique filename
    },
});
const upload = multer({ storage: storage });

// ✅ API to Get Products by Category Name
app.get("/products/:categoryName", (req, res) => {
    const { categoryName } = req.params;

    const sql = `
        SELECT p.product_id, p.img, p.title, p.price, p.descri, p.que, c.category_name
        FROM products p
        JOIN categories c ON p.category_id = c.category_id
        WHERE c.category_name = ?
    `;

    db.query(sql, [categoryName], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(result);
    });
});

/* ---------------------------------------------------------
 ✅ Add Product API (Image Upload Supported)
--------------------------------------------------------- */
app.post("/add-product", upload.single("img"), (req, res) => {
    const { category_id, title, price, descri, que } = req.body;
    const img = req.file ? `/uploads/${req.file.filename}` : null;

    const sql = "INSERT INTO products (category_id, img, title, price, descri, que) VALUES (?, ?, ?, ?, ?, ?)";
    db.query(sql, [category_id, img, title, price, descri, que], (err, result) => {
        if (err) {
            console.error("Error inserting product:", err);
            return res.status(500).json({ error: "Database error", details: err });
        }
        res.json({ message: "Product added successfully", product_id: result.insertId });
    });
});

/* ---------------------------------------------------------
 ✅ Get All Products API (Includes Category Name)
--------------------------------------------------------- */
app.get("/products", (req, res) => {
    const sql = `
    SELECT p.product_id, p.img, p.title, p.price, p.descri, p.que, c.category_name 
    FROM products p 
    JOIN categories c ON p.category_id = c.category_id
  `;

    db.query(sql, (err, results) => {
        if (err) {
            console.error("Error fetching products:", err);
            return res.status(500).json({ error: "Database error", details: err });
        }
        res.json(results);
    });
});

/* ---------------------------------------------------------
 ✅ Update Product API (Image Upload Supported)
--------------------------------------------------------- */
app.put("/update-product/:id", upload.single("img"), (req, res) => {
    const { id } = req.params;
    const { category_id, title, price, descri, que } = req.body;
    const newImage = req.file ? `/uploads/${req.file.filename}` : null;

    db.query("SELECT img FROM products WHERE product_id = ?", [id], (err, result) => {
        if (err) {
            console.error("Error retrieving product image:", err);
            return res.status(500).json({ error: "Database error", details: err });
        }

        const oldImage = result[0]?.img;
        let sql = "UPDATE products SET category_id=?, title=?, price=?, descri=?, que=? WHERE product_id=?";
        let values = [category_id, title, price, descri, que, id];

        if (newImage) {
            sql = "UPDATE products SET category_id=?, img=?, title=?, price=?, descri=?, que=? WHERE product_id=?";
            values = [category_id, newImage, title, price, descri, que, id];

            // ✅ Delete old image (if exists)
            if (oldImage) {
                const oldImagePath = path.join(__dirname, oldImage);
                fs.unlink(oldImagePath, (err) => {
                    if (err && err.code !== "ENOENT") console.error("Error deleting old image:", err);
                });
            }
        }

        db.query(sql, values, (err, result) => {
            if (err) {
                console.error("Error updating product:", err);
                return res.status(500).json({ error: "Database error", details: err });
            }
            res.json({ message: "Product updated successfully" });
        });
    });
});

/* ---------------------------------------------------------
 ✅ Delete Product API (Also Deletes Image)
--------------------------------------------------------- */
app.delete("/delete-product/:id", (req, res) => {
    const { id } = req.params;

    db.query("SELECT img FROM products WHERE product_id = ?", [id], (err, result) => {
        if (err) {
            console.error("Error retrieving product image:", err);
            return res.status(500).json({ error: "Database error", details: err });
        }

        const imagePath = result[0]?.img;

        db.query("DELETE FROM products WHERE product_id=?", [id], (err, result) => {
            if (err) {
                console.error("Error deleting product:", err);
                return res.status(500).json({ error: "Database error", details: err });
            }

            // ✅ Delete the image from the server
            if (imagePath) {
                const fullImagePath = path.join(__dirname, imagePath);
                fs.unlink(fullImagePath, (err) => {
                    if (err && err.code !== "ENOENT") console.error("Error deleting image:", err);
                });
            }

            res.json({ message: "Product deleted successfully" });
        });
    });
});

/* ---------------------------------------------------------
 ✅ Start Server
--------------------------------------------------------- */
app.listen(Port, () => {
    console.log(`Server running on http://127.0.0.1:${Port}`);
});

