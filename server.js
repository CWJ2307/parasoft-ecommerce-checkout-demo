const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();

app.use(cors());
app.use(express.json());

app.use(express.static(path.join(__dirname, "public")));

const products = [
  {
    id: 1,
    name: "iPhone 15",
    price: 4999,
    image: "/images/iphone15.jfif"
  },
  {
    id: 2,
    name: "MacBook Air",
    price: 5499,
    image: "/images/macbookair.jfif"
  },
  {
    id: 3,
    name: "AirPods Pro",
    price: 999,
    image: "/images/airpodspro.jfif"
  }
];

let orders = [];
let paymentMode = "BUILT_IN";

app.get("/api/products", (req, res) => {
  res.json(products);
});

app.post("/api/checkout", async (req, res) => {
  const { name, email, cardNumber, items, total } = req.body;
  
  let paymentMessage = "";
  
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
  
  const orderId = "ORD-" + Date.now();
  
  let paymentStatus = "APPROVED";

  if (paymentMode === "BUILT_IN") {
    if (cardNumber === "4000000000000002") paymentStatus = "DECLINED";
    if (cardNumber === "5555555555554444") paymentStatus = "TIMEOUT";
    if (cardNumber === "4444444444444444") paymentStatus = "FRAUD";
    if (cardNumber === "6666666666666666") paymentStatus = "BLOCKED";
  }

  if (paymentMode === "VIRTUALIZE") {
    try {
      const paymentResponse = await fetch(
        "http://localhost:9080/payment/charge",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            orderId,
			cardNo: cardNumber,
            amount: total,
			currency: "MYR"
          })
        }
      );

      const paymentData = await paymentResponse.json();
	  
      paymentStatus = paymentData.status || "PAYMENT_ERROR";

    } catch (error) {
      paymentStatus = "TIMEOUT";
    }
  }
  
  if (paymentMode === "PAYMENT_GATEWAY") {
    try {
      const paymentResponse = await fetch(
        "http://localhost:3000/pay",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            orderId,
            cardNo: cardNumber,
            cardNumber,
            amount: total,
            currency: "MYR"
          })
        }
      );

      const paymentData = await paymentResponse.json();

      console.log("Calling Payment Gateway App:", "http://localhost:3000/pay");
      console.log("Payment Gateway request:", {
        orderId,
        cardNo: cardNumber,
        cardNumber,
        amount: total,
        currency: "MYR"
      });
      console.log("Payment Gateway response:", paymentData);

      paymentStatus = paymentData.status || "PAYMENT_ERROR";
      paymentMessage = paymentData.message || "";

    } catch (error) {
      console.error("PAYMENT_GATEWAY ERROR:", error);

      paymentStatus = "TIMEOUT";
      paymentMessage = "Payment Gateway unavailable or timeout.";
    }
  }

  const order = {
    orderId,
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

  res.json({
    status: paymentStatus,
    orderId,
    total,
    message: paymentMessage || `Order created with payment status: ${paymentStatus}`
  });
});

app.get("/api/orders", (req, res) => {
  res.json(orders);
});

app.post("/api/admin/reinitialize", (req, res) => {
  orders = [];

  res.json({
    status: "SUCCESS",
    message: "Demo data reinitialized successfully."
  });
});

app.get("/api/admin/settings", (req, res) => {
  res.json({
    paymentMode
  });
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

app.listen(3001, () => {
  console.log("Checkout Demo running on http://localhost:3001");
});