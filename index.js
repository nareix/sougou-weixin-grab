
var co = require('co');
var request = require('./request');
var cheerio = require('cheerio');
var vm = require('vm');
var xml2js = require('xml2js');
var denodeify = require('denodeify');
xml2js.parseString = denodeify(xml2js.parseString);

module.exports = co.wrap(function *(opt) {
	if (opt.weixinChanId == null)
		throw new Error('weixinChanId must set');

	var res = yield request('http://weixin.sogou.com/gzh?openid='+opt.weixinChanId);
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
		'cb=cb&openid='+opt.weixinChanId,
		sandbox.aes,
		'page='+opt.page,
		't='+Date.now(),
	].join('&');

	var jsonp = (yield request(url)).body;
	return yield new Promise(function (fulfill, reject) {
		sandbox = {cb: co.wrap(function *(r) {
			r.items = yield r.items.map(function (xml) {
				return xml2js.parseString(xml);
			});
			r.items = r.items.map(function (r) {
				r = r.DOCUMENT.item[0].display[0];
				for (var k in r)
					r[k] = r[k][0];
				return r;
			});
			fulfill(r);
		})};
		vm.createContext(sandbox);
		vm.runInContext(jsonp, sandbox);
	});
});

