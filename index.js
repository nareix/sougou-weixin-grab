
var co = require('co');
var request = require('request-promise');
var cheerio = require('cheerio');
var vm = require('vm');
var xml2js = require('xml2js');
var denodeify = require('promise').denodeify;
xml2js.parseString = denodeify(xml2js.parseString);

module.exports = co.wrap(function *(weixinChanId) {
	var res = yield request({
		method: 'GET',
		uri: 'http://weixin.sogou.com/gzh?openid=' + weixinChanId,
		resolveWithFullResponse: true,
	});
	var cookie = res.headers['set-cookie'].map(function (c) {
		return c.split(';')[0];
	}).join('; ');
	
	var $ = cheerio.load(res.body);
	var sandbox = {
		Image: function () {},
		document: {cookie: cookie},
	};
	sandbox.window = sandbox;
	vm.createContext(sandbox);
	var scripts = $('head > script');
	vm.runInContext(scripts[0].children[0].data, sandbox);
	vm.runInContext(scripts[1].children[0].data, sandbox);

	var url = 'http://weixin.sogou.com/gzhjs?' + [
		'cb=cb&openid='+weixinChanId,
		sandbox.aes,
		'page=1',
		't='+Date.now(),
	].join('&');

	var jsonp = yield request(url);
	return yield new Promise(function (fulfill, reject) {
		sandbox = {cb: co.wrap(function *(r) {
			var res = yield r.items.map(function (xml) {
				return xml2js.parseString(xml);
			});
			fulfill(res.map(function (r) {
				r = r.DOCUMENT.item[0].display[0];
				for (var k in r)
					r[k] = r[k][0];
				return r;
			}));
		})};
		vm.createContext(sandbox);
		vm.runInContext(jsonp, sandbox);
	});
});

