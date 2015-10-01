
var argv = require('minimist')(process.argv.slice(2));

if (argv.t)
	setTimeout(function () {
		process.stderr.write('timeout\n');
		process.exit(1);
	}, argv.t*1000);

var index = require('./index.js');

index.getWeixinChanContent({
	id: argv._[0],
	page: parseInt(argv._[1]) || 1,
}).then(function (r) {
	process.stdout.write(JSON.stringify(r));
}, function (e) {
	process.stderr.write('usage: node cli.js freebuf 1 -t 10\n');
	process.stderr.write(e.stack);
});

