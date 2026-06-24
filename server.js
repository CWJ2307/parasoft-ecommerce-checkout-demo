const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();

app.use(cors());
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));
app.use(express.static(path.join(__dirname, "public")));



const products = [
  { id: 1, name: "iPhone 15", price: 4999, image: "/images/iphone15.jfif" },
  { id: 2, name: "MacBook Air", price: 5499, image: "/images/macbookair.jfif" },
  { id: 3, name: "AirPods Pro", price: 999, image: "/images/airpodspro.jfif" }
];

let orders = [];
let paymentMode = "BUILT_IN";

let inventory = {
  1: { name: "iPhone 15", stock: 10 },
  2: { name: "MacBook Air", stock: 5 },
  3: { name: "AirPods Pro", stock: 20 }
};

app.get("/api/inventory", (req, res) => {
  res.json(inventory);
});

app.use((err, req, res, next) => {
  console.error(err);

  if (err.type === "entity.too.large") {
    return res.status(413).json({
      status: "FAILED",
      message: "Payload too large"
    });
  }

  res.status(500).json({
    status: "FAILED",
    message: "Server error"
  });
});

app.get("/api/products", (req, res) => {
  const merged = products.map(p => ({
    ...p,
    stock: inventory[p.id]?.stock ?? 0
  }));

  res.json(merged);
});

app.post("/api/admin/inventory/update", (req, res) => {
  const { id, stock } = req.body;

  if (!inventory[id]) {
    return res.status(404).json({
      status: "FAILED",
      message: "Product not found"
    });
  }

  inventory[id].stock = Number(stock);

  res.json({
    status: "SUCCESS",
    inventory
  });
});

app.post("/api/checkout", async (req, res) => {
  const { name, email, cardNumber, items, total } = req.body;

  // 1. validation
  if (!name || !email || !cardNumber || !items || items.length === 0) {
    return res.status(400).json({
      status: "FAILED",
      message: "Missing checkout information"
    });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({
      status: "FAILED",
      message: "Invalid email address."
    });
  }

  if (!/^\d{16}$/.test(cardNumber)) {
    return res.status(400).json({
      status: "FAILED",
      message: "Credit card number must be 16 digits."
    });
  }

  const supportedCards = [
    "4111111111111111",
    "4000000000000002",
    "5555555555554444",
    "4444444444444444",
    "6666666666666666"
  ];

  if (!supportedCards.includes(cardNumber)) {
    return res.status(400).json({
      status: "FAILED",
      message: "Unsupported demo credit card number."
    });
  }

  // 2. STOCK CHECK (FINAL FIX)
  const tempStock = {};

  for (let item of items) {
    tempStock[item.id] = (tempStock[item.id] || 0) + 1;
  }

  for (let id in tempStock) {
    const pid = Number(id);

    if (!inventory[pid] || inventory[pid].stock < tempStock[id]) {
      return res.json({
        status: "DECLINED",
        message: "Insufficient stock"
      });
    }
  }
  
  for (let item of items) {
    inventory[item.id].stock -= 1;
  }

  // 3. PAYMENT MODE
  const orderId = "ORD-" + Date.now();
  const transactionId = "TXN-" + Date.now();

  let paymentStatus = "APPROVED";
  let paymentMessage = "";

  if (paymentMode === "BUILT_IN") {
    if (cardNumber === "4000000000000002") paymentStatus = "DECLINED";
    if (cardNumber === "5555555555554444") paymentStatus = "TIMEOUT";
    if (cardNumber === "4444444444444444") paymentStatus = "FRAUD";
    if (cardNumber === "6666666666666666") paymentStatus = "BLOCKED";
  }

  if (paymentMode === "VIRTUALIZE") {
    try {
      const paymentResponse = await fetch("http://localhost:9080/payment/charge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId,
          cardNo: cardNumber,
          amount: total,
          currency: "MYR"
        })
      });

      const paymentData = await paymentResponse.json();
      paymentStatus = paymentData.status || "PAYMENT_ERROR";

    } catch (error) {
      paymentStatus = "TIMEOUT";
    }
  }

  if (paymentMode === "PAYMENT_GATEWAY") {
    try {
      const paymentResponse = await fetch("http://localhost:3000/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId,
          cardNo: cardNumber,
          amount: total,
          currency: "MYR"
        })
      });

      const paymentData = await paymentResponse.json();

      paymentStatus = paymentData.status || "PAYMENT_ERROR";
      paymentMessage = paymentData.message || paymentData.status || "";

    } catch (error) {
      paymentStatus = "TIMEOUT";
      paymentMessage = "Payment Gateway unavailable";
    }
  }

  // 4. SAVE ORDER
  const order = {
    orderId,
    transactionId,
    name,
    email,
    items,
    total,
    status: paymentStatus,
    paymentMode,
    paymentMessage,
    createdAt: new Date().toISOString()
  };

  orders.push(order);

  // 5. DEDUCT STOCK ONLY IF SUCCESS
  if (paymentStatus === "APPROVED") {
    for (let item of items) {
      if (inventory[item.id]) {
        inventory[item.id].stock -= 1;
      }
    }
  }

  res.json({
    status: paymentStatus,
    orderId,
    transactionId,
    total,
    message: paymentMessage || `Order created with payment status: ${paymentStatus}`
  });
});

app.get("/api/orders", (req, res) => {
  res.json(orders);
});

app.post("/api/admin/reinitialize", (req, res) => {
  orders = [];
  res.json({ status: "SUCCESS", message: "Demo data reinitialized successfully." });
});

app.get("/api/admin/settings", (req, res) => {
  res.json({ paymentMode });
});

app.post("/api/admin/settings/payment-mode", (req, res) => {
  const { mode } = req.body;

  if (!["BUILT_IN", "VIRTUALIZE", "PAYMENT_GATEWAY"].includes(mode)) {
    return res.status(400).json({
      status: "FAILED",
      message: "Invalid payment mode"
    });
  }

  paymentMode = mode;

  res.json({
    status: "SUCCESS",
    paymentMode
  });
});

app.post("/api/admin/product/add", (req, res) => {
  const { name, price, stock, image } = req.body;

  if (!name || !price || stock == null) {
    return res.status(400).json({
      status: "FAILED",
      message: "Missing fields"
    });
  }

  const id = Date.now();

  products.push({
    id,
    name,
    price: Number(price),
    image: image || "/images/default.png"
  });

  inventory[id] = {
    name,
    stock: Number(stock)
  };

  res.json({
    status: "SUCCESS",
    products,
    inventory
  });
});

app.listen(3001, () => {
  console.log("Checkout Demo running on http://localhost:3001");
});