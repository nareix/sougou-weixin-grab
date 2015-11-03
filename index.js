
var child_process = require('child_process');
var querystring = require('querystring');
var URL = require('url');
var co = require('co');
var vm = require('vm');
var xml2js = require('xml2js');
var denodeify = require('denodeify');
var requestRaw = require('request');
var request = denodeify(requestRaw);
var path = require('path');
var fs = require('fs');
var cheerio = require('cheerio');
fs.writeFile = denodeify(fs.writeFile);
fs.readFile = denodeify(fs.readFile);
xml2js.parseString = denodeify(xml2js.parseString);

// grab({
//   url: xxoo,
//   onResourceRequested: function (ctx, req) {
//     ctx.fulfill(ssos);
//   },
//   onLoadFinished: function (ctx, req) {
//     ctx.fulfill(p.page.content);
//   },
//   debug: true,
//   useRequest: true,
//   returnCookies: true,
// }).then(...);

var grab = co.wrap(function *(args) {
	var JSONStringify = function (o) {
		return JSON.stringify(o, function (k, v) {
			if (typeof(v) == 'function')
				return '#func:'+v.toString();
			return v;
		});
	};

	var toughCookiesToPhantomjsCookies = function (cookies) {
		return cookies.map(function (c) {
			var date = new Date(c.expires);
			return {
				name: c.key,
				value: c.value,
				domain: '.'+c.domain,
				expires: date.toString(),
				expiry: date.getTime()/1000,
				hostonly: c.hostOnly || false,
				httponly: c.httpOnly || false,
				secure: c.secure || false,
			};
		});
	};

	var phantomjsCookiesToToughCookies = function (cookies) {
		return cookies.map(function (c) {
			return {
				key: c.name,
				value: c.value,
				domain: c.domain.substr(1),
				expires: new Date(c.expiry*1000).toISOString(),
				hostOnly: c.hostonly || false,
				httpOnly: c.httponly || false,
				secure: c.secure || false,
			};
		});
	};

	var callPhantom = co.wrap(function *() {
		return new Promise(function (fulfill, reject) {
			var p = child_process.spawn('phantomjs', ['grab.js']);
			p.stdin.end(JSONStringify(args));
			var outs = '';
			p.stdout.on('data', function (s) {
				outs += s;
			});
			if (args.debug)
				p.stderr.on('data', function (s) {
					process.stderr.write(s);
				});
			p.on('close', function (code) {
				if (code != 0)
					reject(new Error('grab exec failed'));
				var r;
				try {
					r = JSON.parse(outs);
				} catch (e) {
					reject(new Error('grab output json parse failed'));
				}
				fulfill(r);
			});
			p.on('error', reject);
		});
	});

	var callRequest = co.wrap(function *() {
		var jar = requestRaw.jar();
		phantomjsCookiesToToughCookies(args.cookies).forEach(function (c) {
			jar._jar.store.putCookie(c, function () {});
		});
		var r = yield request({
			url: args.url,
			jar: jar,
		});
		return {
			r: r.body,
			cookies: toughCookiesToPhantomjsCookies(jar._jar.serializeSync().cookies),
		};
	});
	
	var cookieRoot = process.env.GRAB_COOKIE_ROOT || '/tmp/cookies';
	var cliCount = process.env.GRAB_CLI_COUNT || 100;
	var cookiePath = path.join(cookieRoot, Math.ceil(Math.random()*cliCount).toString());

	if (!fs.existsSync(cookieRoot))
		fs.mkdirSync(cookieRoot);

	if (fs.existsSync(cookiePath)) {
		try {
			args.cookies = args.cookies || JSON.parse(yield fs.readFile(cookiePath));
		} catch (e) {
		}
	}
	args.cookies = args.cookies || [];

	var r = yield (args.useRequest ? callRequest() : callPhantom());
	yield fs.writeFile(cookiePath, JSON.stringify(r.cookies));

	if (args.returnCookies)
		return r;
	return r.r;
});

module.exports.grab = grab;

module.exports.searchChan = co.wrap(function *(opts) {
	if (opts.keyword == null)
		throw new Error('keyword must set');

	var body = yield grab({
		useRequest: true,
		url: 'http://weixin.sogou.com/weixin?query='+encodeURI(opts.keyword),
		params: {
			keyword: opts.keyword,
		},
	});

	var $ = cheerio.load(body);
	return $('.results .wx-rb').map(function (i, v) {
		return {
			logo: $(v).find('.img-box img').attr('src'),
			title: $(v).find('.txt-box h3').text(),
		};
	}).get();
});

module.exports.getChanArticles = co.wrap(function *(opts) {
	var parseCbRes = function (res) {
		return new Promise(function (fulfill, reject) {
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
			vm.runInContext(res, sandbox);
		});
	};

	var buildopt = function (req, page) {
		var headers = {};
		req.headers.forEach(function (h) {
			headers[h.name] = h.value;
		});
		var u = URL.parse(req.url);
		var q = querystring.parse(u.query);
		q.cb = 'cb';
		q.page = page || q.page;
		delete u.href;
		delete u.search;
		delete u.path;
		u.query = q;
		return {
			url: URL.format(u),
			headers: headers,
		};
	};

	if (opts.keyword == null)
		throw new Error('keyword must set');

	var grabRes = yield grab({
		//url: 'http://weixin.sogou.com/',
		url: 'http://weixin.sogou.com/weixin?query='+encodeURI(opts.keyword),
		params: {
			keyword: opts.keyword,
			step: 1,
		},
		returnCookies: opts.returnCookies,
		onLoadFinished: function (ctx, page) {
			var p = ctx.params;
			if (p.step == 0) {
				page.evaluate(function (keyword) {
					$('.query').val(keyword);
					$('#public-num').click();
					$('#searchForm').submit();
				}, p.keyword);
				p.step++;
			} else if (p.step == 1) {
				var off = page.evaluate(function () {
					return $('.results .wx-rb').first().offset();
				});
				page.sendEvent('click', off.left, off.top);
				p.step++;
			} else
				ctx.reject();
		},
		onResourceRequested: function (ctx, req) {
			if (req.url.startsWith('http://weixin.sogou.com/gzhjs'))
				ctx.fulfill(req);
		},
	});

	var body = (yield request(buildopt(opts.returnCookies ? grabRes.r : grabRes, opts.page))).body;
	var parseRes = yield parseCbRes(body);

	if (opts.returnCookies)
		return Object.assign({}, parseRes, {cookies: cookies});
	else
		return parseRes;
});

