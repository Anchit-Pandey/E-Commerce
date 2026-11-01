import Product from "../models/product.model.js";
import mongoose from "mongoose";

const MAX_CART_QUANTITY = 99;

const getCartProductId = (item) => {
	const productId = item?.product;
	return productId && mongoose.isValidObjectId(productId) ? String(productId) : null;
};

const cleanCartItems = (user) => {
	const validItems = (user.cartItems || []).filter((item) => getCartProductId(item));
	if (validItems.length !== (user.cartItems || []).length) {
		user.cartItems = validItems;
	}
	return user.cartItems;
};

export const getCartProducts = async (req, res) => {
	try {
		const storedCartItems = cleanCartItems(req.user);
		const productIds = storedCartItems.map((item) => item.product);
		const products = await Product.find({ _id: { $in: productIds } });

		const cartItems = products.map((product) => {
			const item = storedCartItems.find((cartItem) => getCartProductId(cartItem) === String(product._id));
			return { ...product.toJSON(), quantity: item?.quantity || 0 };
		});

		if (req.user.isModified("cartItems")) await req.user.save();
		res.json(cartItems);
	} catch (error) {
		console.log("Error in getCartProducts controller", error.message);
		res.status(500).json({ message: "Server error", error: error.message });
	}
};

export const addToCart = async (req, res) => {
	try {
		const { productId } = req.body;
		const user = req.user;
		if (!mongoose.isValidObjectId(productId)) {
			return res.status(400).json({ message: "Invalid product ID" });
		}
		if (!(await Product.exists({ _id: productId }))) {
			return res.status(404).json({ message: "Product not found" });
		}

		const cartItems = cleanCartItems(user);
		const existingItem = cartItems.find((item) => getCartProductId(item) === productId);
		if (existingItem) {
			if (existingItem.quantity >= MAX_CART_QUANTITY) {
				return res.status(400).json({ message: "Maximum quantity reached" });
			}
			existingItem.quantity += 1;
		} else {
			cartItems.push({ product: productId, quantity: 1 });
		}

		await user.save();
		res.json(user.cartItems);
	} catch (error) {
		console.log("Error in addToCart controller", error.message);
		res.status(500).json({ message: "Server error", error: error.message });
	}
};

export const removeAllFromCart = async (req, res) => {
	try {
		const { productId } = req.body;
		const user = req.user;
		if (!productId) {
			user.cartItems = [];
		} else {
			if (!mongoose.isValidObjectId(productId)) {
				return res.status(400).json({ message: "Invalid product ID" });
			}
			user.cartItems = cleanCartItems(user).filter((item) => getCartProductId(item) !== productId);
		}
		await user.save();
		res.json(user.cartItems);
	} catch (error) {
		res.status(500).json({ message: "Server error", error: error.message });
	}
};

export const updateQuantity = async (req, res) => {
	try {
		const { id: productId } = req.params;
		const quantity = Number(req.body.quantity);
		const user = req.user;
		if (!mongoose.isValidObjectId(productId) || !Number.isInteger(quantity) || quantity < 0 || quantity > MAX_CART_QUANTITY) {
			return res.status(400).json({ message: "Invalid quantity or product ID" });
		}
		const cartItems = cleanCartItems(user);
		const existingItem = cartItems.find((item) => getCartProductId(item) === productId);

		if (existingItem) {
			if (quantity === 0) {
				user.cartItems = cartItems.filter((item) => getCartProductId(item) !== productId);
				await user.save();
				return res.json(user.cartItems);
			}

			existingItem.quantity = quantity;
			await user.save();
			res.json(user.cartItems);
		} else {
			res.status(404).json({ message: "Product not found" });
		}
	} catch (error) {
		console.log("Error in updateQuantity controller", error.message);
		res.status(500).json({ message: "Server error", error: error.message });
	}
};