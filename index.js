
var child_process = require('child_process');
var querystring = require('querystring');
var URL = require('url');
var co = require('co');
var vm = require('vm');
var xml2js = require('xml2js');
var denodeify = require('denodeify');
var request = denodeify(require('request'));
var path = require('path');
var fs = require('fs');
fs.writeFile = denodeify(fs.writeFile);
fs.readFile = denodeify(fs.readFile);
xml2js.parseString = denodeify(xml2js.parseString);

var CLI_COUNT = 30;

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

var grab = co.wrap(function *(keyword) {
	var cookies = {};
	var ckpath = path.join('cookies', Math.ceil(Math.random()*CLI_COUNT).toString());

	if (fs.existsSync(ckpath)) {
		try {
			cookies = JSON.parse(yield fs.readFile(ckpath));
		} catch (e) {
		}
	}

	var r = yield new Promise(function (fulfill, reject) {
		var p = child_process.spawn('./phantomjs', ['grab.js']);
		p.stdin.end(JSON.stringify({keyword: keyword, cookies: cookies}));
		var outs = '';
		p.stdout.on('data', function (s) {
			outs += s;
		});
		p.on('close', function (code) {
			var r = {};
			try {
				r.res = JSON.parse(outs);
			} catch (e) {
				code = 1;
			}
			r.code = code;
			fulfill(r);
		});
		p.on('error', reject);
	});

	if (r.code == 0)
		yield fs.writeFile(ckpath, JSON.stringify(r.res.cookies));

	return r;
});

var buildopt = function (r, page) {
	var headers = {};
	r.req.headers.forEach(function (h) {
		headers[h.name] = h.value;
	});
	var u = URL.parse(r.req.url);
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

module.exports.getWeixinChanContent = co.wrap(function *(opts) {
	if (opts.id == null)
		throw new Error('id must set');
	var r = yield grab(opts.id);
	if (r.code != 0)
		throw new Error('grab failed');
	var cookies = r.res.cookies;
	var body = (yield request(buildopt(r.res, opts.page))).body;
	return Object.assign(yield parseCbRes(body), {cookies: cookies});
});

