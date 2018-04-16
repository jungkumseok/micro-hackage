'use strict';
const path = require('path');
const http = require('http');
const chalk = require('chalk');
const express = require('express');
const cookieParser = require('cookie-parser');

const SERVICE_PORT = 3000;
const STATIC_PATH = path.join(__dirname, '/docs');

/* Create main express app  */
const app = express();
const server = http.createServer(app);

// Use a bunch of middlewares
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(httpDebugger);

/* Public App */
app.use('/', express.static(STATIC_PATH));
server.listen(SERVICE_PORT, function(){
	console.log(chalk.green(">>> Starting micro hackage server on Port :"+SERVICE_PORT));
});

function httpDebugger(req, res, next){
	console.log(chalk.yellow(req.method)+ ' '+req.originalUrl+' ----- '+chalk.yellow(req.sessionID));
	// ([ 'referrer', 'cookie', 'user-agent' ])
	Object.keys(req.headers).map(function(key){
		console.log('    '+chalk.blue(key+' : ')+req.headers[key]);
	})
	next();
}
