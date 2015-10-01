
var child_process = require('child_process');
var querystring = require('querystring');
var URL = require('url');
var co = require('co');
var vm = require('vm');
var xml2js = require('xml2js');
var denodeify = require('denodeify');
var request = denodeify(require('request'));
xml2js.parseString = denodeify(xml2js.parseString);

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

var grab = function (inj) {
	return new Promise(function (fulfill, reject) {
		var p = child_process.spawn('./phantomjs', ['grab.js']);

		p.stdin.end(JSON.stringify(inj));

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
};

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
	var r = yield grab({keyword: opts.id});
	if (r.code != 0)
		throw new Error('grab failed');
	r = (yield request(buildopt(r.res, opts.page))).body;
	return parseCbRes(r);
});

