
var argv = require('minimist')(process.argv.slice(2));

if (argv.t)
	setTimeout(function () {
		process.stderr.write('timeout\n');
		process.exit(1);
	}, argv.t*1000);

require('./index.js')({
	weixinChanId: argv._[0],
	page: parseInt(argv._[1]) || 1,
}).then(function (r) {
	process.stdout.write(JSON.stringify(r));
}, function (e) {
	process.stderr.write('usage: node cli.js <weixinChanId> <page> -t <timeoutSeconds>\n');
	process.stderr.write(e.stack);
});

