/// <reference path="../typings/bluebird/bluebird.d.ts" />
/// <reference path="../typings/express/express.d.ts" />
/// <reference path="../typings/node/node.d.ts" />

import express = require('express');
import fs = require('fs');
import Promise = require('bluebird');

var app = express();
app.set('views', './views')
app.set('view engine', 'jade');

app.get('/', (req, res) => {
    var levelName = req.params.level;
    res.redirect(302, '/level/Main Nexus DX');
});

app.get('/level/:levelName', (req, res) => {
    new Promise((resolve, reject) => {
        if (/[a-z]+/.test(req.params.levelName))
            resolve(req.params.levelName);
        else
            reject(void 0);
    })
    .then(levelName => Promise.promisify(fs.readFile)('static/level-assets/' + levelName + '/manifest.json'))
    .then(text => new Promise(r => r(JSON.parse(<any>text))))
    .then(level => res.render('level', { level: level }))
    .catch(err => {
        console.log(err);
        res.status(404);
        res.write('sorry');
        res.end();
    });
});

app.use('/static', express.static('static'));

var port: number = +process.env.PORT || 3000;

var server = app.listen(port, function() {
    console.log('Express server listening on port ' + port);
});
