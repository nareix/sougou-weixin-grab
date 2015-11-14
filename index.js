
var child_process = require('child_process');
var querystring = require('querystring');
var URL = require('url');
var co = require('co');
var vm = require('vm');
var xml2js = require('xml2js');
var denodeify = require('denodeify');
var requestRaw = require('request');
process.env.SHOW_REQ && require('request-debug')(requestRaw);
var request = denodeify(requestRaw);
var path = require('path');
var fs = require('fs');
var cheerio = require('cheerio');
var toughCookie = require('tough-cookie');
var CookiePool = require('./cookiepool');

xml2js.parseString = denodeify(xml2js.parseString);

var cookiepool = new CookiePool({
	userCookieKey: 'SUID',
	sessionCookieKey: 'SNUID',
});

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
//   cookies: [in phantomjsCookieFormat],
// }).then({body, cookies});
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
			//console.log('toughCookiesToPhantomjsCookies', c, date);
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
				path: '/',
				domain: c.domain.substr(1),
				expires: new Date(c.expiry*1000),
				hostOnly: c.hostonly || false,
				httpOnly: c.httponly || false,
				secure: c.secure || false,
			};
		});
	};

	var callPhantom = co.wrap(function *() {
		return new Promise(function (fulfill, reject) {
			var p = child_process.spawn('phantomjs', [path.join(__dirname, 'grab.js')]);
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
		var store = new toughCookie.MemoryCookieStore();
		//console.log('phantomjsCookiesToToughCookies', args.cookies);
		phantomjsCookiesToToughCookies(args.cookies).forEach(function (c) {
			store.putCookie(new toughCookie.Cookie(c), function (err) { });
		});
		var jar = requestRaw.jar(store);
		var res = yield request({
			url: args.url,
			jar: jar,
		});
		return {
			body: res.body,
			cookies: toughCookiesToPhantomjsCookies(jar._jar.serializeSync().cookies),
		};
	});

	if (args.noCookie)
		args.cookies = [];
	else if (args.cookies == null)
		args.cookies = (yield cookiepool.getReqCookie()) || [];

	//console.log('getCookies', args.cookies);
	var res = yield (args.useRequest ? callRequest() : callPhantom());
	//console.log('putCookies', res.cookies);
	yield cookiepool.putResCookie(res.cookies);

	return res;
});

module.exports.grab = grab;

// searchChan({
//   keyword: 'ssb',
// }) => [
// 		{ logo: 'http://img01.sogoucdn.com/app/a/100520090/oIWsFt5Apd0rD1E8qOpHAAipFpyk',
//     title: 'ssbjme198' }
// ]
module.exports.searchChan = co.wrap(function *(opts) {
	var res = yield grab({
		useRequest: true,
		url: 'http://weixin.sogou.com/weixin?query='+encodeURI(opts.keyword || ''),
	});

	var $ = cheerio.load(res.body);
	return $('.results .wx-rb').map(function (i, v) {
		return {
			logo: $(v).find('.img-box img').attr('src'),
			title: $(v).find('.txt-box h3').text(),
		};
	}).get();
});

module.exports.getAllCookies = function (opts) {
	return cookiepool.getAllEntries(opts);
};

module.exports.removeOldCookie = function (opts) {
	return cookiepool.removeOldCookie(opts);
};

module.exports.getNewCookie = co.wrap(function *() {
	var res = yield grab({
		url: 'http://weixin.sogou.com/weixin?query=',
		onLoadFinished: function (ctx, req) {
			ctx.fulfill();
		},
		noCookie: true,
	});
	return cookiepool.putResCookie(res.cookies);
});

// getChanArticles({
//   keyword: 'xxoo',
//   page: 1,
//   fetchContent: true,
//   lastModifiedGt: 144741211,
//   limit: 2,
// }) => {
//   totalItems: 2147,
//   totalPages: 10,
//   page: 1,
//   items: [
//     { title, 
//       content, 
//       date: '2015-11-3',
//       lastModified: 144741211,
//       url: '/websearch/art.jsp?sg=sn77VhdTZLpHadHTi_ho_8VQPpV6...',
//     },
//   ],
// }
module.exports.getChanArticles = co.wrap(function *(opts) {

	// code=`cb({items:['xmltext', 'xmltext', ...]})`
	// return {items:[{}, {}, ...]}
	var execCbCodeGetResult = function (code) {
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
			vm.runInContext(code, sandbox);
		});
	};

	// req={
	//   url: http://weixin.sogou.com?cb=originalCallback,
	//   headers: [{name,value}...]
	// }
	// page=1
	// return `cb(...)`
	var grabCbCode = co.wrap(function *(req, page) {
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

		return (yield grab({
			url: URL.format(u),
			headers: headers,
			cookies: cookies,
			useRequest: true,
		})).body;
	});

	// keyword='freebuf'
	// return {body: {phantom request for cbcode}, cookies}
	var grabCbPhantomReq = function (opts) {
		return grab({
			url: 'http://weixin.sogou.com/weixin?query='+encodeURI(opts.keyword),
			debug: true,
			params: {
				keyword: opts.keyword,
				step: 1,
			},
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
					if (off == null)
						return ctx.fulfill({empty: true});
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
	};

	var filterItems = co.wrap(function *(items) {
		if (opts.lastModifiedGt)
			items = items.filter(item => item.lastModified > opts.lastModifiedGt);

		if (opts.limit)
			items = items.slice(0, opts.limit);

		if (opts.fetchContent)
			yield Promise.all(items.map(item => grab({
				// item.url: '/websearch/art.jsp?sg=sn77VhdTZLpHadHTi_ho_8VQPpV6...',
				url: 'http://weixin.sogou.com'+item.url,
				useRequest: true,
				cookies: cookies,
			}).then((res) => {
				item.contentHtml = res.body;
			})));

		return items;
	});

	var res = yield grabCbPhantomReq({keyword: opts.keyword || ''});
	var cbCodeReq = res.body;
	var cookies = res.cookies;
	//console.log('cbCodeReq', cbCodeReq);

	var result = cbCodeReq.empty ? {totalItems: 0, items: []} : yield co.wrap(function *() {
		var code = yield grabCbCode(cbCodeReq, opts.page);
		//console.log('code', code.substr(0, 6));
		return execCbCodeGetResult(code);
	})();

	result.items = yield filterItems(result.items);

	if (opts.returnCookies)
		result.cookies = cookies;

	return result;
});

