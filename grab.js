
var page = require('webpage').create();
var system = require('system');

String.prototype.startsWith = function (s) {
	return this.substr(0, s.length) == s;
};

log = function () {
	var a = [];
	for (var i = 0; i < arguments.length; i++)
		a.push(arguments[i]);
	system.stderr.writeLine(a.join(' '));
};

JSONParse = function (o) {
	return JSON.parse(o, function (k, v) {
		if (typeof(v) == 'string' && v.substr(0,6)=='#func:') {
			return (new Function('return '+v.substr(6)))();
		}
		return v;
	})
};

readStdin = function () {
	var r = '';
	for (;;) {
		var s = system.stdin.read();
		if (s.length == 0)
			break;
		r += s;
	}
	return r;
};

errToString = function (msg, trace) {
	var msgStack = ['ERROR: ' + msg];
	if (trace && trace.length) {
		msgStack.push('TRACE:');
		trace.forEach(function(t) {
			msgStack.push(' -> ' + t.file + ': ' + t.line + (t.function ? ' (in function "' + t.function +'")' : ''));
		});
	}
	return msgStack.join(' | ');
};

function initpage(page) {
	page.settings.loadImages = false;
	page.settings.userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_9_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/45.0.2454.101 Safari/537.36';
	if (ctx.cookies)
		page.cookies = ctx.cookies;
	if (ctx.headers)
		page.customHeaders = ctx.headers;

	page.onResourceRequested = function (req) {
		log('Request', req.url);
		if (ctx.onResourceRequested)
			ctx.onResourceRequested(new Context(ctx, page), req);
	};

	page.onResourceReceived = function(res) {
		//log('Response (#' + res.id + ', stage "' + res.stage + '"): ' + JSON.stringify(res));
	};

	page.onResourceError = function(resourceError) {
		log('Unable to load resource (#' + resourceError.id + 'URL:' + resourceError.url + ')');
		log('Error code: ' + resourceError.errorCode + '. Description: ' + resourceError.errorString);
	};

	page.onNavigationRequested = function (url, type, will, main) {
		log('->', url, type, will, main);
	};

	page.onConsoleMessage = function (msg, lineNum, sourceId) {
		log('CONSOLE: ' + msg + ' (from line #' + lineNum + ' in "' + sourceId + '")');
	};

	page.onError = function (msg, trace) {
		log(errToString(msg, trace));
	};

	page.onLoadStarted = function() {
		var currentUrl = page.evaluate(function() {
			return window.location.href;
		});
	};

	page.onPageCreated = function (newpage) {
		//log('newpage', newpage.cookies);
		initpage(newpage);
	};

	page.onLoadFinished = function (status) {
		log('finisned', status);
		if (status != 'success')
			new Context(ctx, page).reject();
		else if (ctx.onLoadFinished)
			ctx.onLoadFinished(new Context(ctx, page), page);
	};
}

phantom.onError = function (msg, trace) {
	log(errToString(msg, trace));
	phantom.exit(1);
};

var Context = function (ctx, page) {
	this.params = ctx.params;
	this.page = page;
};

Context.prototype.exit = function (code, r) {
	system.stdout.write(JSON.stringify({
		body: r,
		cookies: this.page.cookies,
	}));
	phantom.exit(code);
};

Context.prototype.fulfill = function (r) {
	this.exit(0, r);
};

Context.prototype.reject = function (r) {
	this.exit(1, r);
};

ctx = JSONParse(readStdin());

initpage(page);
page.open(ctx.url);
// http://weixin.sogou.com

