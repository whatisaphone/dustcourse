/// <reference path="../../typings/lodash/lodash.d.ts" />

import * as levelViewer from './levelViewer';

(<any>window).Dustworld = {
    initLevelViewer: levelViewer.init,
};
