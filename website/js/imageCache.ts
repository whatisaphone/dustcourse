export default class ImageCache {
	private images: { [url: string]: HTMLImageElement } = {};

	public get(url: string, onLoad: () => void) {
		var ret = this.images[url];
		if (ret)
			return ret;

		ret = this.images[url] = document.createElement('img');
		ret.src = url;
		ret.addEventListener('load', e => onLoad());
		return ret;
	}
}
