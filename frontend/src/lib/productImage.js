const fallbackImages = {
	jeans: "/jeans.jpg",
	"t-shirts": "/tshirts.jpg",
	shoes: "/shoes.jpg",
	glasses: "/glasses.png",
	jackets: "/jackets.jpg",
	suits: "/suits.jpg",
	bags: "/bags.jpg",
};

export const getProductImage = (product) => {
	const fallback = fallbackImages[product?.category] || "/vite.svg";
	const image = typeof product?.image === "string" ? product.image.trim() : "";
	return { image: image || fallback, fallback };
};
