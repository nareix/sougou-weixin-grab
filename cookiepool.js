
var Db = require('./loki');
var db = new Db(process.env.COOKIEPOOL_DBPATH || 'cookiepool.db');
require('./polyfill');

var dbp = process.env.COOKIEPOOL_DEBUG ?
		function () { console.log.apply(console, arguments) } : 
		() => {};

// config={userCookieKey,sessionCookieKey}
var CookiePool = function (config) {
	this._config = config;
	this._col = db.collection('pool', {
		schema: {
			user:  String,
			session: String,
			expire: Date,
			revoked: Boolean,
			revokedAt: Date,
			createAt: Date,
			reqCount: Number,
			lastReqAt: Date,
			cookie: Array,
		},
	});
};

CookiePool.prototype._cookieToRecord = function (cookie) {
	var dict = {};
	cookie.forEach(x => dict[x.name] = x); 

	var user = dict[this._config.userCookieKey].value;
	var session = dict[this._config.sessionCookieKey].value;
	if (user == null || session == null)
		return;

	return {
		user: user,
		session: session,
		expire: new Date(+dict[this._config.sessionCookieKey].expiry*1000),
		cookie: cookie,
	};
};

// var reqCookie = getReqCookie()
// res = request(reqCookie)
// if (success)
//    putResCookie(res.cookie);
// else if (antispider)
//    revokeCookie(reqCookie);

// return null/cookie[]
CookiePool.prototype.getReqCookie = function () {
	return this._col
			.find({revoked: false})
			.sort({lastReqAt: 1})
			.first()
			.then(x => {
				dbp('getReq', x && x.user);
				return x && x.cookie;
			})
};

CookiePool.prototype.revokeCookie = function (cookie) {
	var rec = this._cookieToRecord(cookie);
	if (rec == null)
		return Promise.resolve();

	return this._col.update({
		user: rec.user,
		session: rec.session,
	}, {
		expire: rec.expire,
		cookie: rec.cookie,
		revoked: true,
		revokedAt: new Date(),
	});
};

CookiePool.prototype.removeOldCookie = function (opts) {
	var query = {};
	if (opts.expired)
		query.expire = {$lt: new Date()};
	var chain = this._col.remove(query).sort({createAt: 1});
	if (opts.limit)
		chain = chain.limit(opts.limit);
	return chain;
};

// cookie[]
CookiePool.prototype.putResCookie = function (cookie) {
	var rec = this._cookieToRecord(cookie);
	if (rec == null)
		return Promise.resolve();

	dbp('putRes', rec.user);

	return this._col.update({
		user: rec.user,
	}, {
		expire: rec.expire,
		user: rec.user,
		session: rec.session,
		cookie: rec.cookie,
		$inc: {
			reqCount: 1,
		},
		lastReqAt: new Date(),
	}, {upsert: true}).then(() => rec);
};

// opts={excludeCookie=true/false}
// return [{Entry}...]
CookiePool.prototype.getAllEntries = function (opts) {
	return this._col.find().then(res => {
		if (opts && opts.excludeCookie)
			res.forEach(x => delete x.cookie);
		return res;
	});
};

module.exports = CookiePool;

