
'use strict';

var Loki = require('lokijs');
var fs = require('fs');
var denodeify = require('denodeify');
var _ = require('underscore');

Loki.prototype.loadDatabase = denodeify(Loki.prototype.loadDatabase);
Loki.prototype.saveDatabase = denodeify(Loki.prototype.saveDatabase);

class Db {
	constructor(filename) {
		this._filename = filename;
	}

	_loadDb() {
		if (this._loki)
			return Promise.resolve();

		this._loki = new Loki(this._filename);

		setInterval(() => {
			this._loki.saveDatabase();
		}.bind(this), 5000).unref();

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
	constructor(promise, opts) {
		this._promise = promise;
		this._call = [];
		this._opts = opts;
	}

	sortFn(fn) {
		this._call.push['sort', fn];
		return this;
	}

	then(ok, fail) {
		return this._promise.then((col) => {
			var chain = col.chain();
			this._call.forEach(function (call) {
				chain = chain[call[0]](call[1], call[2], call[3]);
			});

			var data = chain.data().map(x => {
				x._id = x.$loki;
				return _.omit(x, 'meta', '$loki');
			});

			if (this._opts.filter)
				data = this._opts.filter(data);

			return data;
		}).then(ok, fail);
	}
}

['find', 'limit', 'skip'].forEach((name) => {
	Chain.prototype[name] = function (a1,a2,a3) {
		this._call.push([name,a1,a2,a3]);
		return this;
	}
})

class Collection {
	constructor(db, name, opts) {
		this._db = db;
		this._name = name;
		this._opts = opts;
	}

	_convertTo(v, constructor) {
		if (constructor === Date)
			return new Date(Date.parse(v));
		else if (constructor === Number)
			return +v;
		return v;
	}

	_applySchema(data, schema) {
		return data.map(x => {
			for (var k in x) {
				var v = x[k];
				var constructor = schema[k];
				if (constructor) {
					if (v.constructor !== constructor)
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

	_prepareCol() {
		return Promise.resolve().then(() => {
			if (this._col)
				return;
			return this._db._loadCollection(this._name).then((col) => {
				this._col = col;
			});
		}).then(() => {
			return this._col;
		});
	}

	insert(doc) {
		return this._prepareCol().then(x => x.insert(this._filterSchema([doc])[0]))
			.then(() => this._db._save());
	}

	find(query) {
		return new Chain(this._prepareCol(), {
			filter: this._filterSchema.bind(this),
		}).find(query);
	}

}

module.exports = Db;

