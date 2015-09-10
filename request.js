
var request = require('request');
var jar = request.jar();
//request.debug = true;
request = request.defaults({
	jar: jar,
	headers: {
		'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_9_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/44.0.2403.157 Safari/537.36',
	},
});
request = require('denodeify')(request);
module.exports.request = request;
module.exports.jar = jar;

