export function convertIntToColorRGB(color: number) {
    var r = (color & 0xff0000) >> 16;
    var g = (color & 0xff00) >> 8;
    var b = color & 0xff;
    return 'rgb(' + r + ',' + g + ',' + b + ')';
}
