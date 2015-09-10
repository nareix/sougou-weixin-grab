
var querystring = require('querystring');
var URL = require('url');
var co = require('co');
var request = require('./request').request;
var cheerio = require('cheerio');
var vm = require('vm');
var xml2js = require('xml2js');
var denodeify = require('denodeify');
xml2js.parseString = denodeify(xml2js.parseString);

module.exports.searchWeixinChan = co.wrap(function *(opt) {
	if (opt.keyword == null)
		throw new Error('keyword must set');

	var res = yield request('http://weixin.sogou.com/');

	var chans = [];
	var res = yield request('http://weixin.sogou.com/weixin?query='+encodeURI(opt.keyword));

	var $ = cheerio.load(res.body);
	$('.results .wx-rb').each(function (_, rb) {
		rb = $(rb);
		var imgsrc = rb.find('.img-box img').attr('src');
		var url = rb.attr('href');
		var q = querystring.parse(URL.parse(url).query);
		var title = rb.find('.txt-box h3').text();
		var idTitle = rb.find('.txt-box h4 span').text();
		var desc = rb.find('.txt-box .sp-txt').text();

		chans.push({
			img: imgsrc,
			id: q.openid,
			title: title,
			idTitle: idTitle,
			desc: desc,
		});
	});

	return chans;
});

module.exports.getWeixinChanContent = co.wrap(function *(opt) {
	if (opt.id == null)
		throw new Error('id must set');

	var res = yield request('http://weixin.sogou.com/gzh?openid='+opt.id);
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
		'cb=cb&openid='+opt.id,
		sandbox.aes,
		'page='+opt.page,
		't='+Date.now(),
	].join('&');

	var jsonp = (yield request(url)).body;
	var res = yield new Promise(function (fulfill, reject) {
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

	var jar = require('./request').jar;
	var uri = 'http://weixin.sogou.com';
	res.cookies = {
		object: jar.getCookies(uri),
		string: jar.getCookieString(uri),
	};

	return res;
});

