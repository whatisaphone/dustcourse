/// <reference path="../typings/bluebird/bluebird.d.ts" />
/// <reference path="../typings/express/express.d.ts" />
/// <reference path="../typings/node/node.d.ts" />

import * as express from 'express';
import * as http from 'http';
import * as fs from 'fs';
import * as Promise from 'bluebird';
import * as dustforce from './dustforce';
import * as httpx from './httpx';

var app = express();
app.set('views', __dirname + '/views')
app.set('view engine', 'jade');

app.get('/', (req, res) => {
    res.render('level', { levelName: 'Main Nexus DX' });
});

app.get('/level/Main%20Nexus%20DX', (req, res) => {
    res.redirect(302, '/');
});

app.get('/level/:levelName', (req, res) => {
    res.render('level', { levelName: req.params.levelName });
});

app.get('/replay/:replayId.json', (req, res) => {
    var replayId = parseInt(req.params.replayId, 10);
    getReplay(replayId)
        .then(replay => {
            res.header('Content-Type', 'application/json');
            res.send(JSON.stringify(replay));
        })
        .catch(err => { genericError(res, err); });
});

app.get('/replay/:replayId', (req, res) => {
    var replayId = parseInt(req.params.replayId, 10);
    getReplay(replayId)
        .then(replay => {
            res.redirect(303, '/level/' + replay.level + '#replay=' + replayId);
        })
        .catch(err => { genericError(res, err); });
});

app.use('/assets', express.static(__dirname + '/assets', { maxAge: 1000 * 60 * 60 }));

app.use('/static', express.static(__dirname + '/static', { maxAge: 1000 * 60 * 60 }));

app.get('/favicon.ico', (req, res) => { res.sendFile(__dirname + '/static/favicon.ico', { maxAge: 1000 * 60 * 60 }); });
app.get('/favicon.png', (req, res) => { res.sendFile(__dirname + '/static/favicon.png', { maxAge: 1000 * 60 * 60 }); });

function genericError(res: express.Response, err: any) {
    console.log(err);
    res.status(500);
    res.write('sorry');
    res.end();
}

function getReplay(replayId: number) {
    return httpx.request(http, {
        host: 'dustkid.com',
        path: '/backend8/get_replay.php?replay=' + replayId,
    })
        .then(httpx.readBodyAsBuffer)
        .then(dustforce.parseReplay);
}

var port: number = +process.env.PORT || 3000;

var server = app.listen(port, function() {
    console.log('Express server listening on port ' + port);
});
