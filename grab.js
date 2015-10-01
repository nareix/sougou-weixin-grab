
var page = require('webpage').create();
var system = require('system');

log = function () {
	var a = [];
	for (var i = 0; i < arguments.length; i++)
		a.push(arguments[i]);
	system.stderr.writeLine(a.join(' '));
};

String.prototype.startsWith = function (s) {
	return this.substr(0, s.length) == s;
};

function initpage(page) {
	page.settings.loadImages = false;
	page.settings.userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_9_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/45.0.2454.101 Safari/537.36';
	if (args.cookies)
		page.cookies = args.cookies;

	page.onResourceRequested = function (req) {
		log('Request', req.url);
		if (req.url.startsWith('http://weixin.sogou.com/gzhjs')) {
			system.stdout.write(JSON.stringify({
				req: req,
				cookies: page.cookies,
			}));
			phantom.exit(0);
		}
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
		var msgStack = ['ERROR: ' + msg];

		if (trace && trace.length) {
			msgStack.push('TRACE:');
			trace.forEach(function(t) {
				msgStack.push(' -> ' + t.file + ': ' + t.line + (t.function ? ' (in function "' + t.function +'")' : ''));
			});
		}

		log('error', msgStack.join('\n'));
	};

	page.onLoadStarted = function() {
		var currentUrl = page.evaluate(function() {
			return window.location.href;
		});
		//log('Current page ' + currentUrl + ' will gone...');
		//log('Now loading a new page...');
	};

	page.onClosing = function(closingPage) {
		//log('The page is closing! URL: ' + closingPage.url);
	};

	page.onPageCreated = function (newpage) {
		log('newpage', newpage.cookies);
		initpage(newpage);
	};

	page.onLoadFinished = function (status) {
		log('step', step, status);

		if (status === "success") {
			if (step == 0) {
				page.evaluate(function (args) {
					$('.query').val(args.keyword);
					$('#public-num').click();
					$('#searchForm').submit();
				}, args);
				step++;
			} else if (step == 1) {
				var off = page.evaluate(function () {
					return $('.results .wx-rb').first().offset();
				});
				page.sendEvent('click', off.left, off.top);
				step++;
			} else
				phantom.exit(1);
		} else 
			phantom.exit(1);
	};
}

try {
	var line = system.stdin.readLine();
	args = JSON.parse(line);
	step = 0;
	initpage(page);

	var url = 'http://weixin.sogou.com';
	page.open(url);
} catch (e) {
	log(e);
	phantom.exit(1);
}

