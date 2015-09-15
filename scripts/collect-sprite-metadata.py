from collections import OrderedDict
import glob
import json
import os


def main():
    c = collect()
    c.sort(key = lambda x: x[0])
    c = OrderedDict(c)
    print(json.dumps(c, separators=(',',':')))

def collect():
    root = '../build/website/static/sprites'
    hitboxes = []
    for (dirpath, dirnames, filenames) in os.walk(root):
        for fn in glob.glob(dirpath + '/*.json'):
            metadata = json.load(open(fn))
            name = os.path.relpath(fn, root).replace('\\', '/')[:-5]
            hitboxes.append((name, metadata['hitbox']))
    return hitboxes


if __name__ == '__main__':
    main()
