
'use strict';

var Loki = require('lokijs');
var fs = require('fs');
var denodeify = require('denodeify');
var _ = require('underscore');

Loki.prototype.loadDatabase = denodeify(Loki.prototype.loadDatabase);
Loki.prototype.saveDatabase = denodeify(Loki.prototype.saveDatabase);

class Db {
	constructor(filename, opts) {
		this._filename = filename;
		this._opts = opts;
	}

	_loadDb() {
		if (this._loki)
			return Promise.resolve();

		this._loki = new Loki(this._filename);

		if (this._opts && this._opts.saveInterval) {
			setInterval(() => {
				this._loki.saveDatabase();
			}.bind(this), this._opts.saveInterval).unref();
		}

		if (fs.existsSync(this._filename))
			return this._loki.loadDatabase({});

		return Promise.resolve();
	}

	_loadCollection(name) {
		return this._loadDb().then(() => {
			var exist = this._loki.listCollections().filter(c => c.name == name).length;
			return this._loki[exist ? 'getCollection' : 'addCollection'](name);
		});
	}

	_save() {
		return this._loki.saveDatabase();
	}

	collection(name, opts) {
		return new Collection(this, name, opts);
	}
}

class Chain {
	constructor(promise) {
		this._promise = promise;
		this._calls = [];
		this._filters = [];
	}

	sortFn(fn) {
		this._calls.push(['sort', fn]);
		return this;
	}

	find(query) {
		this._calls.push(['find', query]);
		return this;
	}

	limit(n) {
		this._calls.push(['limit', n]);
		return this;
	}

	sort(dict) {
		var k, asc;
		for (k in dict) asc = dict[k] > 0;
		this._calls.push(['simplesort', k, !asc]);
		return this;
	}

	count() {
		this._filters.push(x => x.length);
		return this;
	}

	then(ok, fail) {
		return this._promise.then((col) => {
			var chain = col.chain();
			this._calls.forEach(function (call) {
				chain = chain[call[0]].apply(chain, call.slice(1));
			});

			var data = chain.data();
			this._filters.forEach(fn => data = fn(data, col));

			return data;
		}).then(ok, fail);
	}

	first() {
		this.limit(1);
		this._filters.push(x => x[0]);
		return this;
	}

	_filter(fn) {
		this._filters.push(fn);
		return this;
	}
}

class Collection {
	constructor(db, name, opts) {
		this._db = db;
		this._name = name;
		this._opts = opts;
	}

	_convertTo(v, constructor) {
		if (constructor === Date)
			return v ? new Date(Date.parse(v)) : new Date();
		else if (constructor === Number)
			return v ? +v : 0;
		else if (constructor == Boolean)
			return !!v;
		else if (constructor == String)
			return v ? v : '';
		else if (constructor == Array)
			return v ? v : [];
		return v;
	}

	_applySchema(data, schema) {
		return data.map(x => {
			for (var k in schema) {
				var v = x[k];
				var constructor = schema[k];
				if (constructor) {
					if (v == null || v.constructor !== constructor)
						x[k] = this._convertTo(v, constructor);
				}
			}
			return x;
		});
	}

	_filterSchema(data) {
		if (this._opts.schema)
			return this._applySchema(data, this._opts.schema);
		return data;
	}

	_filterField(data) {
		return data.map(x => {
			var r = {};
			for (var k in x) {
				if (k == '$loki')
					r['_id'] = x[k];
				else if (k != 'meta')
					r[k] = x[k];
			}
			return r;
		});
	}

	_filterRemove(data, col) {
		data.forEach(x => col.remove(x));
		return data.length > 0 ? this._db._save() : Promise.resolve();
	}

	_prepareCol() {
		if (this._col)
			return Promise.resolve(this._col);
		return this._db._loadCollection(this._name).then((col) => {
			this._col = col;
			return col;
		});
	}

	_convQuery(query) {
		var r = [];
		for (var k in query)
			r.push({[k]: query[k]});
		return {$and: r};
	}

	find(query) {
		return new Chain(this._prepareCol()).find(this._convQuery(query))
					._filter(this._filterField)
					._filter(this._filterSchema.bind(this));
	}

	remove(query) {
		return new Chain(this._prepareCol()).find(this._convQuery(query))
					._filter(this._filterRemove.bind(this));
	}

	insert(doc) {
		return this._prepareCol().then(x => x.insert(this._filterSchema([doc])[0]))
				.then(() => this._db._save())
	}

	update(query, doc, opts) {
		var res = {nMatched: 0, nModified: 0, nUpserted: 0};

		return this._prepareCol().then((col) => {
			var chain = col.chain().find(this._convQuery(query));

			if (!(opts && opts.multi))
				chain = chain.limit(1);

			var apply = (x) => {
				for (var k in doc) {
					if (k == '$inc') {
						var inc = doc[k];
						for (var k in inc)
							x[k] = (x[k] || 0) + inc[k];
					} else
						x[k] = doc[k];
				}
				return x;
			};

			chain.update((x) => {
				apply(x);
				res.nModified++;
				res.nMatched++;
			});

			if (res.nMatched == 0 && opts && opts.upsert) {
				var x = apply(this._filterSchema([{}])[0]);
				col.insert(x);
				res.nUpserted++;
			}

			if (res.nModified || res.nUpserted)
				return this._db._save();
		}).then(() => res);
	}
}

module.exports = Db;

