// import Coupon from "../models/coupon.model.js";
// import Order from "../models/order.model.js";
// import { stripe } from "../lib/stripe.js";

// export const createCheckoutSession = async (req, res) => {
// 	try {
// 		const { products, couponCode } = req.body;

// 		if (!Array.isArray(products) || products.length === 0) {
// 			return res.status(400).json({ error: "Invalid or empty products array" });
// 		}

// 		let totalAmount = 0;

// 		const lineItems = products.map((product) => {
// 			const amount = Math.round(product.price * 100); // stripe wants u to send in the format of cents
// 			totalAmount += amount * product.quantity;

// 			return {
// 				price_data: {
// 					currency: "usd",
// 					product_data: {
// 						name: product.name,
// 						images: [product.image],
// 					},
// 					unit_amount: amount,
// 				},
// 				quantity: product.quantity || 1,
// 			};
// 		});

// 		let coupon = null;
// 		if (couponCode) {
// 			coupon = await Coupon.findOne({ code: couponCode, userId: req.user._id, isActive: true });
// 			if (coupon) {
// 				totalAmount -= Math.round((totalAmount * coupon.discountPercentage) / 100);
// 			}
// 		}

// 		const session = await stripe.checkout.sessions.create({
// 			payment_method_types: ["card"],
// 			line_items: lineItems,
// 			mode: "payment",
// 			success_url: `${process.env.CLIENT_URL}/purchase-success?session_id={CHECKOUT_SESSION_ID}`,
// 			cancel_url: `${process.env.CLIENT_URL}/purchase-cancel`,
// 			discounts: coupon
// 				? [
// 						{
// 							coupon: await createStripeCoupon(coupon.discountPercentage),
// 						},
// 				  ]
// 				: [],
// 			metadata: {
// 				userId: req.user._id.toString(),
// 				couponCode: couponCode || "",
// 				products: JSON.stringify(
// 					products.map((p) => ({
// 						id: p._id,
// 						quantity: p.quantity,
// 						price: p.price,
// 					}))
// 				),
// 			},
// 		});

// 		if (totalAmount >= 20000) {
// 			await createNewCoupon(req.user._id);
// 		}
// 		res.status(200).json({ url: session.url, totalAmount: totalAmount / 100 });
// 	} catch (error) {
// 		console.error("Error processing checkout:", error);
// 		res.status(500).json({ message: "Error processing checkout", error: error.message });
// 	}
// };

// export const checkoutSuccess = async (req, res) => {
// 	try {
// 		const { sessionId } = req.body;
// 		const session = await stripe.checkout.sessions.retrieve(sessionId);

// 		if (session.payment_status === "paid") {
// 			if (session.metadata.couponCode) {
// 				await Coupon.findOneAndUpdate(
// 					{
// 						code: session.metadata.couponCode,
// 						userId: session.metadata.userId,
// 					},
// 					{
// 						isActive: false,
// 					}
// 				);
// 			}

// 			// create a new Order
// 			const products = JSON.parse(session.metadata.products);
// 			const newOrder = new Order({
// 				user: session.metadata.userId,
// 				products: products.map((product) => ({
// 					product: product.id,
// 					quantity: product.quantity,
// 					price: product.price,
// 				})),
// 				totalAmount: session.amount_total / 100, // convert from cents to dollars,
// 				stripeSessionId: sessionId,
// 			});

// 			await newOrder.save();

// 			res.status(200).json({
// 				success: true,
// 				message: "Payment successful, order created, and coupon deactivated if used.",
// 				orderId: newOrder._id,
// 			});
// 		}
// 	} catch (error) {
// 		console.error("Error processing successful checkout:", error);
// 		res.status(500).json({ message: "Error processing successful checkout", error: error.message });
// 	}
// };

// async function createStripeCoupon(discountPercentage) {
// 	const coupon = await stripe.coupons.create({
// 		percent_off: discountPercentage,
// 		duration: "once",
// 	});

// 	return coupon.id;
// }

// async function createNewCoupon(userId) {
// 	await Coupon.findOneAndDelete({ userId });

// 	const newCoupon = new Coupon({
// 		code: "GIFT" + Math.random().toString(36).substring(2, 8).toUpperCase(),
// 		discountPercentage: 10,
// 		expirationDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
// 		userId: userId,
// 	});

// 	await newCoupon.save();

// 	return newCoupon;
// }


import Coupon from "../models/coupon.model.js";
import Order from "../models/order.model.js";
import Product from "../models/product.model.js";
import User from "../models/user.model.js";
import { stripe } from "../lib/stripe.js";

const MAX_QUANTITY_PER_PRODUCT = 99;
const REWARD_COUPON_THRESHOLD_CENTS = 20000; // $200 (amount actually paid, after discounts)
const OBJECT_ID_REGEX = /^[a-f\d]{24}$/i;
const clientUrl =
	process.env.NODE_ENV === "production"
		? process.env.RENDER_EXTERNAL_URL || process.env.CLIENT_URL
		: process.env.CLIENT_URL;

// SECURITY: the client is only allowed to tell us WHICH products and HOW MANY.
// Names, prices and images are never read from the request - they come from MongoDB.
// Returns a Map of productId -> quantity (duplicates merged), or null if the input is invalid.
const normalizeCartInput = (products) => {
	if (!Array.isArray(products) || products.length === 0) return null;

	const quantities = new Map();

	for (const item of products) {
		const id = String(item?._id ?? "");
		const quantity = Number(item?.quantity ?? 1);

		if (!OBJECT_ID_REGEX.test(id)) return null;
		if (!Number.isInteger(quantity) || quantity < 1) return null;

		const merged = (quantities.get(id) || 0) + quantity;
		if (merged > MAX_QUANTITY_PER_PRODUCT) return null;

		quantities.set(id, merged);
	}

	return quantities;
};

export const createCheckoutSession = async (req, res) => {
	try {
		const { products, couponCode } = req.body;

		const quantities = normalizeCartInput(products);
		if (!quantities) {
			return res.status(400).json({ error: "Invalid or empty products array" });
		}

		// Look up the REAL product data (price, name, image) in the database
		const ids = [...quantities.keys()];
		const dbProducts = await Product.find({ _id: { $in: ids } }).lean();
		const productsById = new Map(dbProducts.map((product) => [String(product._id), product]));

		if (ids.some((id) => !productsById.has(id))) {
			return res.status(400).json({ error: "One or more products are no longer available" });
		}

		let totalAmount = 0;

		const checkoutItems = ids.map((id) => {
			const product = productsById.get(id);
			const quantity = quantities.get(id);
			const unitAmount = Math.round(product.price * 100); // stripe wants u to send in the format of cents
			totalAmount += unitAmount * quantity;

			return { id, name: product.name, image: product.image, unitAmount, quantity };
		});

		const lineItems = checkoutItems.map((item) => ({
			price_data: {
				currency: "usd",
				product_data: {
					name: item.name,
					images: item.image ? [item.image] : [],
				},
				unit_amount: item.unitAmount,
			},
			quantity: item.quantity,
		}));

		let coupon = null;
		if (couponCode) {
			const normalizedCouponCode = String(couponCode).trim().toUpperCase();
			coupon = await Coupon.findOne({ code: normalizedCouponCode, userId: req.user._id, isActive: true });
			if (!coupon || coupon.expirationDate < new Date()) {
				return res.status(400).json({ error: "Coupon is invalid or expired" });
			}
			totalAmount -= Math.round((totalAmount * coupon.discountPercentage) / 100);
		}

		const session = await stripe.checkout.sessions.create({
			payment_method_types: ["card"],
			line_items: lineItems,
			mode: "payment",
			success_url: `${clientUrl}/purchase-success?session_id={CHECKOUT_SESSION_ID}`,
			cancel_url: `${clientUrl}/purchase-cancel`,
			discounts: coupon
				? [
						{
							coupon: await createStripeCoupon(coupon.discountPercentage),
						},
				  ]
				: [],
			metadata: {
				userId: req.user._id.toString(),
				couponCode: coupon?.code || "",
				products: JSON.stringify(
					checkoutItems.map((item) => ({
						id: item.id,
						quantity: item.quantity,
						price: item.unitAmount / 100,
					}))
				),
			},
		});

		// NOTE: the $200 reward coupon is NOT created here anymore.
		// It is created in checkoutSuccess, only after Stripe confirms the payment.
		res.status(200).json({ url: session.url, totalAmount: totalAmount / 100 });
	} catch (error) {
		console.error("Error processing checkout:", error);
		res.status(500).json({ message: "Error processing checkout", error: error.message });
	}
};

export const checkoutSuccess = async (req, res) => {
	try {
		const { sessionId } = req.body;
		if (!sessionId || typeof sessionId !== "string") {
			return res.status(400).json({ message: "A valid checkout session ID is required" });
		}
		const session = await stripe.checkout.sessions.retrieve(sessionId);

		if (session.payment_status !== "paid") {
			return res.status(409).json({ message: "Payment has not been completed" });
		}
		if (session.metadata?.userId !== req.user._id.toString()) {
			return res.status(403).json({ message: "Checkout session does not belong to this user" });
		}

		const existingOrder = await Order.findOne({ stripeSessionId: sessionId });
		if (existingOrder) {
			return res.status(200).json({
				success: true,
				message: "Order already processed",
				orderId: existingOrder._id,
			});
		}

		if (!session.metadata?.products) {
			return res.status(400).json({ message: "Checkout session metadata is invalid" });
		}

		{
			if (session.metadata.couponCode) {
				await Coupon.findOneAndUpdate(
					{
						code: session.metadata.couponCode,
						userId: session.metadata.userId,
					},
					{
						isActive: false,
					}
				);
			}

			// create a new Order
			let products;
			try {
				products = JSON.parse(session.metadata.products);
			} catch {
				return res.status(400).json({ message: "Checkout session products are invalid" });
			}
			const newOrder = new Order({
				user: session.metadata.userId,
				products: products.map((product) => ({
					product: product.id,
					quantity: product.quantity,
					price: product.price,
				})),
				totalAmount: session.amount_total / 100, // convert from cents to dollars,
				stripeSessionId: sessionId,
			});

			try {
				await newOrder.save();
			} catch (error) {
				if (error?.code === 11000) {
					const duplicateOrder = await Order.findOne({ stripeSessionId: sessionId });
					if (duplicateOrder) {
						return res.status(200).json({
							success: true,
							message: "Order already processed",
							orderId: duplicateOrder._id,
						});
					}
				}
				throw error;
			}

			// The order is saved and the customer has paid. Everything below is a bonus step,
			// so a failure here is only logged - it must never turn a successful purchase into an error.
			try {
				await removePurchasedItemsFromCart(session.metadata.userId, products);
			} catch (error) {
				console.error("Could not clear the cart after purchase:", error.message);
			}

			try {
				if (session.amount_total >= REWARD_COUPON_THRESHOLD_CENTS) {
					await createNewCoupon(session.metadata.userId);
				}
			} catch (error) {
				console.error("Could not create the reward coupon:", error.message);
			}

			res.status(200).json({
				success: true,
				message: "Payment successful, order created, and coupon deactivated if used.",
				orderId: newOrder._id,
			});
		}
	} catch (error) {
		console.error("Error processing successful checkout:", error);
		res.status(500).json({ message: "Error processing successful checkout", error: error.message });
	}
};

// Removes the products that were just paid for from the user's saved cart (in MongoDB).
// Items that are NOT part of this order (e.g. added in another tab meanwhile) are kept.
async function removePurchasedItemsFromCart(userId, purchasedProducts) {
	const user = await User.findById(userId);
	if (!user) return;

	const purchasedIds = new Set(purchasedProducts.map((product) => String(product.id)));
	user.cartItems = user.cartItems.filter((item) => !purchasedIds.has(String(item.product)));
	await user.save();
}

async function createStripeCoupon(discountPercentage) {
	const coupon = await stripe.coupons.create({
		percent_off: discountPercentage,
		duration: "once",
	});

	return coupon.id;
}

async function createNewCoupon(userId) {
	await Coupon.findOneAndDelete({ userId });

	const newCoupon = new Coupon({
		code: "GIFT" + Math.random().toString(36).substring(2, 8).toUpperCase(),
		discountPercentage: 10,
		expirationDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
		userId: userId,
	});

	await newCoupon.save();

	return newCoupon;
}