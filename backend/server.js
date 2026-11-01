import express from "express";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import path from "path";

import authRoutes from "./routes/auth.route.js";
import productRoutes from "./routes/product.route.js";
import cartRoutes from "./routes/cart.route.js";
import couponRoutes from "./routes/coupon.route.js";
import paymentRoutes from "./routes/payment.route.js";
import analyticsRoutes from "./routes/analytics.route.js";

import { connectDB } from "./lib/db.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

const __dirname = path.resolve();

app.use(express.json({ limit: "10mb" })); // allows you to parse the body of the request
app.use(cookieParser());
app.disable("x-powered-by");
app.use((req, res, next) => {
	const origin = req.headers.origin;
	if (origin && origin === process.env.CLIENT_URL) {
		res.setHeader("Access-Control-Allow-Origin", origin);
		res.setHeader("Access-Control-Allow-Credentials", "true");
		res.setHeader("Access-Control-Allow-Headers", "Content-Type");
		res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
	}
	res.setHeader("X-Content-Type-Options", "nosniff");
	res.setHeader("X-Frame-Options", "DENY");
	res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
	if (req.method === "OPTIONS") return res.sendStatus(204);
	next();
});

app.get("/api/health", (req, res) => {
	res.json({ status: "ok" });
});

app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/coupons", couponRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/analytics", analyticsRoutes);

if (process.env.NODE_ENV === "production") {
  // Serve frontend build folder
  app.use(express.static(path.join(__dirname, "/frontend/dist")));

  // For any other route, serve index.html (React Router support)
  app.get("/{*splat}", (req, res) => {
    res.sendFile(path.join(__dirname, "/frontend/dist/index.html"));
  });
}


const startServer = async () => {
	await connectDB();
	app.listen(PORT, () => {
		console.log("Server is running on http://localhost:" + PORT);
	});
};

startServer().catch((error) => {
	console.error("Failed to start server:", error.message);
	process.exit(1);
});