
require('./index.js')({
	weixinChanId: process.argv[2],
	page: parseInt(process.argv[3]) || 1,
}).then(function (r) {
	console.log(r);
}, function (e) {
	console.log('usage: node cli.js <weixinChanId> <page>');
	console.log(e.stack);
});
