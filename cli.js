
var weixinChanId = process.argv[2];
if (weixinChanId == null) {
	console.log('usage: node cli.js oIWsFt6R89qXSzH2JtWTZvqPCHeY');
	process.exit(1);
}

require('./index.js')(weixinChanId).then(function (r) {
	console.log(r);
}, function (e) {
	console.log(e.stack);
});
