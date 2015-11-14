
module.exports = function (banner) {
	return function () {
		console.log.apply(console, Array.prototype.slice.call(arguments).unshift(banner));
	};
};

