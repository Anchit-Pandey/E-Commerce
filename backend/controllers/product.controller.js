import { redis } from "../lib/redis.js";
import cloudinary from "../lib/cloudinary.js";
import Product from "../models/product.model.js";

export const getAllProducts = async (req, res) => {
	try {
		const products = await Product.find({}); // find all products
		res.json({ products });
	} catch (error) {
		console.log("Error in getAllProducts controller", error.message);
		res.status(500).json({ message: "Server error", error: error.message });
	}
};

export const getFeaturedProducts = async (req, res) => {
	try {
		let featuredProducts = await redis.get("featured_products");
		if (featuredProducts) {
			//JSON.parse() is used to convert a JSON string into a JavaScript object. In this case, the featuredProducts variable is expected to be a JSON string retrieved from Redis. By using JSON.parse(), we can convert that string back into a JavaScript object or array, which can then be used in the application.
			try {
				return res.json(JSON.parse(featuredProducts));
			} catch {
				await redis.del("featured_products");
			}
		}

		// if not in redis, fetch from mongodb
		// .lean() is gonna return a plain javascript object instead of a mongodb document
		// which is good for performance
		//used only when we want to perform read operations and not modify the data
		featuredProducts = await Product.find({ isFeatured: true }).lean();

		// store in redis for future quick access
		// JSON.stringify() is used to convert a JavaScript object or value into a JSON string. In this case, the featuredProducts variable is expected to be a JavaScript object or array. By using JSON.stringify(), we can convert that object or array into a JSON string, which can then be stored in Redis.
		await redis.set("featured_products", JSON.stringify(featuredProducts));

		res.json(featuredProducts);
	} catch (error) {
		console.log("Error in getFeaturedProducts controller", error.message);
		res.status(500).json({ message: "Server error", error: error.message });
	}
};

export const createProduct = async (req, res) => {
	try {
		const name = String(req.body.name || "").trim();
		const description = String(req.body.description || "").trim();
		const category = String(req.body.category || "").trim().toLowerCase();
		const price = Number(req.body.price);
		const image = req.body.image;
		const validCategories = ["jeans", "t-shirts", "shoes", "glasses", "jackets", "suits", "bags"];
		if (!name || !description || !validCategories.includes(category) || !Number.isFinite(price) || price < 0 || !image) {
			return res.status(400).json({ message: "Name, description, category, non-negative price, and image are required" });
		}

		let cloudinaryResponse = null;

		if (image) {
			// Upload the image to Cloudinary and get the secure URL, which will be stored in the database
			cloudinaryResponse = await cloudinary.uploader.upload(image, { folder: "products" });
		}
		if (!cloudinaryResponse?.secure_url) {
			return res.status(502).json({ message: "Image upload failed" });
		}

		const product = await Product.create({
			name,
			description,
			price,
			// If the image was uploaded to Cloudinary, use its secure URL; otherwise, use an empty string
			image: cloudinaryResponse?.secure_url ? cloudinaryResponse.secure_url : "",
			category,
		});

		res.status(201).json(product);
	} catch (error) {
		console.log("Error in createProduct controller", error.message);
		res.status(500).json({ message: "Server error", error: error.message });
	}
};

export const deleteProduct = async (req, res) => {
	try {
		const product = await Product.findById(req.params.id);

		if (!product) {
			return res.status(404).json({ message: "Product not found" });
		}

		if (product.image) {
			const publicId = product.image.split("/").pop().split(".")[0];
			try {
				await cloudinary.uploader.destroy(`products/${publicId}`);
				console.log("deleted image from cloduinary");
			} catch (error) {
				console.log("error deleting image from cloduinary", error);
			}
		}

		await Product.findByIdAndDelete(req.params.id);
		await updateFeaturedProductsCache();

		res.json({ message: "Product deleted successfully" });
	} catch (error) {
		console.log("Error in deleteProduct controller", error.message);
		res.status(500).json({ message: "Server error", error: error.message });
	}
};

export const getRecommendedProducts = async (req, res) => {
	try {
		const products = await Product.aggregate([
			{
				$sample: { size: 4 },
			},
			{
				$project: {
					_id: 1,
					name: 1,
					description: 1,
					image: 1,
					category: 1,
					price: 1,
				},
			},
		]);

		res.json(products);
	} catch (error) {
		console.log("Error in getRecommendedProducts controller", error.message);
		res.status(500).json({ message: "Server error", error: error.message });
	}
};

export const getProductsByCategory = async (req, res) => {
	const category = String(req.params.category || "").trim().toLowerCase();
	try {
		const products = await Product.find({ category });
		res.json({ products });
	} catch (error) {
		console.log("Error in getProductsByCategory controller", error.message);
		res.status(500).json({ message: "Server error", error: error.message });
	}
};

export const toggleFeaturedProduct = async (req, res) => {
	try {
		const product = await Product.findById(req.params.id);
		if (product) {
			product.isFeatured = !product.isFeatured;
			const updatedProduct = await product.save();
			await updateFeaturedProductsCache();
			res.json(updatedProduct);
		} else {
			res.status(404).json({ message: "Product not found" });
		}
	} catch (error) {
		console.log("Error in toggleFeaturedProduct controller", error.message);
		res.status(500).json({ message: "Server error", error: error.message });
	}
};

async function updateFeaturedProductsCache() {
	try {
		// The lean() method  is used to return plain JavaScript objects instead of full Mongoose documents. This can significantly improve performance

		const featuredProducts = await Product.find({ isFeatured: true }).lean();
		await redis.set("featured_products", JSON.stringify(featuredProducts));
	} catch (error) {
		console.log("error in update cache function");
	}
}