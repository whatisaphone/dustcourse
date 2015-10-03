/// <reference path="../../typings/lodash/lodash.d.ts" />
/// <reference path="../../typings/pixi.js/pixi.js.d.ts" />
/// <reference path="../../typings/tween.js/tween.js.d.ts" />

import * as levelViewer from './levelViewer';

(<any>window).Dustcourse = {
    initLevelViewer: levelViewer.init,
};
