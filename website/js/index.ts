/// <reference path="../../typings/lodash/lodash.d.ts" />

import wiamap = require('./wiamap');

interface LevelManifest {
	path: string;
	properties: { [key: string]: any };
	layers: { [key: string]: LevelManifestLayer };
}

interface LevelManifestLayer {
	scales: LevelManifestScale[];
}

interface LevelManifestScale {
	scale: number;
	tile_size: [number, number];
	tiles: [number, number][];
}

class LevelWiamapModel implements wiamap.Model {
	public layers: LevelWiamapLayer[];

	constructor(private manifest: LevelManifest) {
		this.layers = _.map(manifest.layers, (l, lk) => {
			var scales = _.map(l.scales, s => new LevelWiamapScale(s.scale, s.tile_size, s.tiles));
			var layerNum = parseInt(lk, 10);
			var parallax = { 6: 0.7, 7: 0.75, 8: 0.8, 9: 0.85, 10: 0.9, 11: 0.95 }[layerNum] || 1;  // TODO: is this right? (esp for layers <= 5)
			var opacity = layerNum <= 12 ? 0.3 : layerNum >= 17 ? 1 : { 13: 0.4, 14: 0.5, 15: 0.6, 16: 0.7 }[layerNum];
			return new LevelWiamapLayer(lk, scales, layerNum, parallax, opacity);
		});
		// this.layers = _.filter(this.layers, l => l.name === '19');
		// this.layers = _.filter(this.layers, l => l.name !== '14');
		// this.layers = _.filter(this.layers, l => l.name !== '19');
		// this.layers = _.filter(this.layers, l => l.parallax !== 1);
	}

	public getTile(layer: LevelWiamapLayer, scale: LevelWiamapScale, x: number, y: number): wiamap.Tile {
		if (!_.find(scale.tiles, t => t[0] === x && t[1] === y))
			return;

		return {
			imageURL: '/static/level-assets/' + this.manifest.path
				+ '/' + layer.name + '_' + scale.scale + '_' + x + ',' + y + '.png',
		};
	}
}

class LevelWiamapLayer implements wiamap.Layer {
	constructor(public name: string, public scales: wiamap.Scale[], public zindex: number, public parallax: number, public opacity: number) { }
}

class LevelWiamapScale implements wiamap.Scale {
	public tileWidth: number;
	public tileHeight: number;

	constructor(public scale: number, tileSize: [number, number], public tiles: [number, number][]) {
		this.tileWidth = tileSize[0];
		this.tileHeight = tileSize[1];
	}
}

function initLevelViewer(manifest: LevelManifest) {
	var model = new LevelWiamapModel(manifest);
	var view = new wiamap.View(model);
	var el = view.element;
	el.setAttribute('class', 'wiamap-stage');
	document.body.appendChild(el);
	view.scrollTo(manifest.properties['p1_x'], manifest.properties['p1_y']);
}

(<any>window).Dustworld = {
	initLevelViewer: initLevelViewer,
};
