
var request = require('request');
//request.debug = true;
request = request.defaults({jar: request.jar()});
request = require('denodeify')(request);
module.exports = request;

