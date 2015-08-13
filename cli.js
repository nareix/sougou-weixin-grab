
var argv = require('minimist')(process.argv.slice(2));

var tasks = [require('./index.js')({
	weixinChanId: argv._[0],
	page: parseInt(argv._[1]) || 1,
})];

var timer;
if (argv.t)
	tasks.push(new Promise(function (_, reject) {
		timer = setTimeout(reject, argv.t*1000, new Error('timeout'));
	}));

Promise.race(tasks).then(function (r) {
	process.stdout.write(JSON.stringify(r));
	clearTimeout(timer);
}, function (e) {
	clearTimeout(timer);
	process.stderr.write('usage: node cli.js <weixinChanId> <page> -t <timeoutSeconds>\n');
	process.stderr.write(e.stack);
});

