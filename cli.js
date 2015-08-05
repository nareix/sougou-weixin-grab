
require('./index.js')({
	weixinChanId: process.argv[2],
	page: parseInt(process.argv[3]) || 1,
}).then(function (r) {
	process.stdout.write(JSON.stringify(r));
}, function (e) {
	process.stderr.write('usage: node cli.js <weixinChanId> <page>');
	process.stderr.write(e.stack);
});
